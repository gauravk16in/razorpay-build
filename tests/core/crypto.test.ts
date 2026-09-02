import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  canonicalHash,
  snapshotHash,
  actionHash,
  signPayload,
  verifyPayload,
} from '../../src/core/crypto.js';
import { snapshotFixture, actionFixture } from '../../src/contracts/fixtures.js';

const KEY = 'test-hmac-key-0123456789abcdef';

describe('crypto: canonical JSON (JCS / RFC 8785)', () => {
  it('sorts keys: canonicalJson({b,a}) pinned', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('canonicalHash({a:1}) matches pinned sha256', () => {
    expect(canonicalHash({ a: 1 })).toBe(
      '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    );
  });

  it('matches pinned RFC 8785 sample (numbers, unicode, escapes)', () => {
    const rfc = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: '€$"\\',
      literals: [null, true, false],
    };
    expect(canonicalJson(rfc)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\"\\\\"}',
    );
  });

  it('is invariant to key order across 100 shuffles', () => {
    const base = canonicalHash({ a: 1, b: [2, 3], c: { d: 'x', e: null } });
    for (let i = 0; i < 100; i++) {
      const shuffled = { c: { e: null, d: 'x' }, b: [2, 3], a: 1 };
      expect(canonicalHash(shuffled)).toBe(base);
    }
  });
});

describe('crypto: domain hashes', () => {
  it('snapshotHash ignores fetched_at but binds all other fields', () => {
    const expected = canonicalHash({
      merchant_id: snapshotFixture.merchant_id,
      items: snapshotFixture.items,
      amount_paise: snapshotFixture.amount_paise,
      currency: snapshotFixture.currency,
    });
    expect(snapshotHash(snapshotFixture)).toBe(expected);
    expect(snapshotHash({ ...snapshotFixture, fetched_at: 999 })).toBe(expected);
    expect(snapshotHash({ ...snapshotFixture, amount_paise: 1 })).not.toBe(expected);
  });

  it('snapshotHash matches pinned vector (SonicStore cart)', () => {
    expect(snapshotHash(snapshotFixture)).toBe(
      '0c8d7977ecfb070efad5ecc87dca525e1a46a8fc96c73c3c53edeb72f1805489',
    );
  });

  it('actionHash binds every action field', () => {
    const h = actionHash(actionFixture);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(actionHash({ ...actionFixture, amount_paise: 1 })).not.toBe(h);
    expect(actionHash({ ...actionFixture, merchant_id: 'evilstore' })).not.toBe(h);
  });
});

describe('crypto: HMAC sign/verify', () => {
  const payload = { mandate_id: 'mnd_0001', amount: 199_900 };

  it('round-trips a valid signature', () => {
    const sig = signPayload(payload, KEY);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyPayload(payload, sig, KEY)).toBe(true);
  });

  it('rejects single-char payload tampering', () => {
    const sig = signPayload(payload, KEY);
    expect(verifyPayload({ ...payload, amount: 199_901 }, sig, KEY)).toBe(false);
  });

  it('rejects wrong key', () => {
    const sig = signPayload(payload, KEY);
    expect(verifyPayload(payload, sig, 'wrong-key')).toBe(false);
  });

  it('rejects wrong-length signature without throwing', () => {
    expect(verifyPayload(payload, 'ab12', KEY)).toBe(false);
  });

  it('rejects non-hex signature without throwing', () => {
    expect(verifyPayload(payload, 'z'.repeat(64), KEY)).toBe(false);
  });

  it('is key-order invariant (canonical signing)', () => {
    const sig = signPayload({ b: 2, a: 1 }, KEY);
    expect(verifyPayload({ a: 1, b: 2 }, sig, KEY)).toBe(true);
  });
});
