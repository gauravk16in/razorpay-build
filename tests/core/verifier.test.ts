import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Verifier, SNAPSHOT_TTL_MS } from '../../src/core/verifier.js';
import { signPayload, snapshotHash } from '../../src/core/crypto.js';
import { mandateSigningCore, MANDATE_TTL_MS } from '../../src/core/mandate.js';
import type { VerifierInput } from '../../src/contracts/interfaces.js';
import type { Mandate } from '../../src/contracts/schemas.js';
import { constraintsFixture, snapshotFixture, actionFixture } from '../../src/contracts/fixtures.js';

const KEY = 'test-verifier-key';
const T0 = 1_757_000_000_000;
const ZERO_HASH = '0'.repeat(64);

function makeMandate(overrides: Partial<Mandate> = {}): Mandate {
  const core = {
    mandate_id: 'mnd_test',
    constraints: constraintsFixture,
    approved_snapshot_hash: snapshotHash(snapshotFixture),
    issued_at: T0,
    expires_at: T0 + MANDATE_TTL_MS,
    nonce: 'nonce-test',
    status: 'ACTIVE' as const,
    ...overrides,
  };
  const m = { ...core, signature: '' } as Mandate;
  return { ...m, signature: signPayload(mandateSigningCore(m), KEY) };
}

function input(overrides: Partial<VerifierInput> = {}): VerifierInput {
  return {
    mandate: makeMandate(),
    action: actionFixture,
    fetched: { ok: true, snapshot: { ...snapshotFixture, fetched_at: T0 } },
    now: T0 + 1_000,
    ...overrides,
  };
}

const verifier = new Verifier(KEY);

describe('verifier: happy path (I6)', () => {
  it('allows a perfectly matching action with complete evidence fields', () => {
    const d = verifier.decide(input());
    expect(d.verdict).toBe('ALLOW');
    expect(d.reason_codes).toEqual(['OK']);
    expect(d.approved_snapshot_hash).toBe(d.fetched_snapshot_hash);
    expect(d.action_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.mandate_id).toBe('mnd_test');
    expect(d.decided_at).toBe(T0 + 1_000);
    expect(d.latency_ms).toBe(0); // caller measures (task card)
  });
});

describe('verifier: field mutations (I2)', () => {
  it('amount ±1 → AMOUNT_MISMATCH', () => {
    const d = verifier.decide(input({ action: { ...actionFixture, amount_paise: 199_901 } }));
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toContain('AMOUNT_MISMATCH');
  });

  it('merchant swap → MERCHANT_MISMATCH', () => {
    const d = verifier.decide(input({ action: { ...actionFixture, merchant_id: 'evilstore' } }));
    expect(d.reason_codes).toContain('MERCHANT_MISMATCH');
  });

  it('currency swap → CURRENCY_MISMATCH', () => {
    const d = verifier.decide(input({ action: { ...actionFixture, currency: 'USD' } }));
    expect(d.reason_codes).toContain('CURRENCY_MISMATCH');
  });

  it('items mutation → ITEMS_MISMATCH', () => {
    const items = [{ ...actionFixture.items[0]!, qty: 2 }];
    const d = verifier.decide(input({ action: { ...actionFixture, items } }));
    expect(d.reason_codes).toContain('ITEMS_MISMATCH');
  });

  it('over cap (even matching a changed snapshot) → OVER_LIMIT', () => {
    const rich = { ...snapshotFixture, amount_paise: 250_000, fetched_at: T0 };
    const d = verifier.decide(
      input({
        action: { ...actionFixture, amount_paise: 250_000 },
        fetched: { ok: true, snapshot: rich },
      }),
    );
    expect(d.reason_codes).toContain('OVER_LIMIT');
  });
});

describe('verifier: checkout binding (I5)', () => {
  it('changed price with action matching NEW price → CHECKOUT_CHANGED + REQUIRE_REAPPROVAL only', () => {
    const changed = { ...snapshotFixture, amount_paise: 189_900, fetched_at: T0 };
    const d = verifier.decide(
      input({
        action: { ...actionFixture, amount_paise: 189_900 },
        fetched: { ok: true, snapshot: changed },
      }),
    );
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toEqual(['CHECKOUT_CHANGED']);
    expect(d.next_action).toBe('REQUIRE_REAPPROVAL');
  });
});

describe('verifier: snapshot health', () => {
  it('fetch failure → SNAPSHOT_UNAVAILABLE with zero-hash sentinel', () => {
    const d = verifier.decide(input({ fetched: { ok: false, error: 'UNREACHABLE' } }));
    expect(d.reason_codes).toContain('SNAPSHOT_UNAVAILABLE');
    expect(d.fetched_snapshot_hash).toBe(ZERO_HASH);
  });

  it('fetched_at in the future → SNAPSHOT_FROM_FUTURE', () => {
    const d = verifier.decide(
      input({ fetched: { ok: true, snapshot: { ...snapshotFixture, fetched_at: T0 + 60_000 } } }),
    );
    expect(d.reason_codes).toContain('SNAPSHOT_FROM_FUTURE');
  });

  it('snapshot older than TTL → STALE_SNAPSHOT', () => {
    const d = verifier.decide(
      input({ now: T0 + SNAPSHOT_TTL_MS + 1 }),
    );
    expect(d.reason_codes).toContain('STALE_SNAPSHOT');
  });

  it('snapshot from wrong merchant → MERCHANT_BINDING_VIOLATION (I12)', () => {
    const wrong = { ...snapshotFixture, merchant_id: 'evilstore', fetched_at: T0 };
    const d = verifier.decide(input({ fetched: { ok: true, snapshot: wrong } }));
    expect(d.reason_codes).toContain('MERCHANT_BINDING_VIOLATION');
  });
});

describe('verifier: mandate lifecycle (I3, I4)', () => {
  it('expired mandate → MANDATE_EXPIRED', () => {
    const d = verifier.decide(input({ now: T0 + MANDATE_TTL_MS + 1 }));
    expect(d.reason_codes).toContain('MANDATE_EXPIRED');
  });

  it('consumed mandate → MANDATE_CONSUMED', () => {
    const d = verifier.decide(input({ mandate: makeMandate({ status: 'CONSUMED' }) }));
    expect(d.reason_codes).toContain('MANDATE_CONSUMED');
  });

  it('superseded mandate → REPLAY_DETECTED', () => {
    const d = verifier.decide(input({ mandate: makeMandate({ status: 'SUPERSEDED' }) }));
    expect(d.reason_codes).toContain('REPLAY_DETECTED');
  });
});

describe('verifier: integrity + fail-closed (I10, I13)', () => {
  it('tampered mandate signature → MANDATE_INVALID only (short-circuit)', () => {
    const tampered = { ...makeMandate(), signature: 'e'.repeat(64) };
    const d = verifier.decide(input({ mandate: tampered }));
    expect(d.reason_codes).toEqual(['MANDATE_INVALID']);
  });

  it('signature over mutated constraints → MANDATE_INVALID', () => {
    const m = makeMandate();
    const tampered: Mandate = { ...m, constraints: { ...m.constraints, max_amount_paise: 9_999_999 } };
    expect(verifier.decide(input({ mandate: tampered })).reason_codes).toEqual(['MANDATE_INVALID']);
  });

  it('malformed action → DENY VERIFIER_ERROR, never throws', () => {
    const garbage = { nope: true } as unknown as VerifierInput['action'];
    const d = verifier.decide(input({ action: garbage }));
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toContain('VERIFIER_ERROR');
  });

  it('malformed mandate → DENY VERIFIER_ERROR with sentinel hashes', () => {
    const d = verifier.decide(input({ mandate: null as unknown as Mandate }));
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toContain('VERIFIER_ERROR');
    expect(d.approved_snapshot_hash).toBe(ZERO_HASH);
  });
});

describe('verifier: performance (NFR2)', () => {
  it('10k decisions, p99 < 5ms', () => {
    const inp = input();
    const times: number[] = [];
    for (let i = 0; i < 10_000; i++) {
      const t = performance.now();
      verifier.decide(inp);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)]!;
    console.log(`verifier p50=${times[5000]!.toFixed(3)}ms p99=${p99.toFixed(3)}ms`);
    expect(p99).toBeLessThan(5);
  });
});
