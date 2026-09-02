import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlLedger } from '../../src/core/ledger.js';
import { Executor, TOKEN_TTL_MS } from '../../src/core/executor.js';
import type { CreateOrderRequest, RazorpayGateway, RzpOrder } from '../../src/contracts/interfaces.js';
import {
  actionFixture,
  decisionFixture,
  rzpOrderFixture,
  tokenFixture,
} from '../../src/contracts/fixtures.js';

const T0 = 1_757_000_000_000;
const ALLOW_DECISION = decisionFixture; // verdict ALLOW, decision_id dec_0001

class SpyGateway implements RazorpayGateway {
  calls: CreateOrderRequest[] = [];
  error: Error | null = null;
  ledgerStateAtCall: boolean | null = null;
  constructor(private ledger: JsonlLedger) {}
  async createOrder(req: CreateOrderRequest): Promise<RzpOrder> {
    this.calls.push(req);
    // capture whether the token was committed BEFORE the gateway was invoked
    const tokens = [...this.ledger.replay().tokens.values()];
    this.ledgerStateAtCall = tokens.length > 0 ? tokens.every((t) => t.used) : null;
    if (this.error) throw this.error;
    return rzpOrderFixture;
  }
  async fetchOrder(): Promise<RzpOrder> {
    return rzpOrderFixture;
  }
  async fetchAllOrders(): Promise<RzpOrder[]> {
    return [rzpOrderFixture];
  }
}

let dir: string;
let clock: { now: number };
let ledger: JsonlLedger;
let executor: Executor;
let gateway: SpyGateway;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rp-exec-'));
  clock = { now: T0 };
  ledger = new JsonlLedger(join(dir, 'ledger.jsonl'), () => clock.now);
  executor = new Executor(ledger, () => clock.now);
  gateway = new SpyGateway(ledger);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function issueToken() {
  return executor.issueToken(ALLOW_DECISION);
}

describe('executor: authorization guards (I1)', () => {
  it('refuses ALLOW execution without a token', async () => {
    await expect(executor.execute({ decision: ALLOW_DECISION, token: undefined, gateway, action: actionFixture })).rejects.toThrow(/token/);
    expect(gateway.calls).toHaveLength(0);
  });

  it('refuses a token minted for a different decision', async () => {
    const foreign = await executor.issueToken({ ...ALLOW_DECISION, decision_id: 'dec_9999' });
    await expect(executor.execute({ decision: ALLOW_DECISION, token: foreign, gateway, action: actionFixture })).rejects.toThrow(/match/);
    expect(gateway.calls).toHaveLength(0);
  });

  it('refuses a DENY decision', async () => {
    const deny = { ...ALLOW_DECISION, verdict: 'DENY' as const, reason_codes: ['AMOUNT_MISMATCH' as const] };
    await expect(executor.execute({ decision: deny, token: tokenFixture, gateway, action: actionFixture })).rejects.toThrow(/DENY/);
    expect(gateway.calls).toHaveLength(0);
  });

  it('refuses an expired token', async () => {
    const token = await issueToken();
    clock.now = T0 + TOKEN_TTL_MS + 1;
    await expect(executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture })).rejects.toThrow(/expired/);
    expect(gateway.calls).toHaveLength(0);
  });
});

describe('executor: single-use + ordering (I3)', () => {
  it('executes once; replay with same token throws and gateway sees exactly one call', async () => {
    const token = await issueToken();
    const rec = await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    expect(rec.status).toBe('CREATED');
    expect(rec.razorpay_order_id).toBe('order_TEST123');
    await expect(executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture })).rejects.toThrow(/used/);
    expect(gateway.calls).toHaveLength(1);
  });

  it('commits the token BEFORE calling the gateway', async () => {
    const token = await issueToken();
    await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    expect(gateway.ledgerStateAtCall).toBe(true);
  });
});

describe('executor: request mapping (F1–F3)', () => {
  it('maps amount/currency/receipt/notes exactly; receipt = rp-<decision_id> ≤40 chars', async () => {
    const token = await issueToken();
    await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    const req = gateway.calls[0]!;
    expect(req.amount_paise).toBe(199_900);
    expect(req.currency).toBe('INR');
    expect(req.receipt).toBe('rp-dec_0001');
    expect(req.receipt.length).toBeLessThanOrEqual(40);
    expect(req.notes).toMatchObject({ mandate_id: 'mnd_0001', decision_id: 'dec_0001' });
  });

  it('truncates receipt to 40 chars for long decision ids', async () => {
    const longDecision = { ...ALLOW_DECISION, decision_id: `dec_${'x'.repeat(60)}` };
    const token = await executor.issueToken(longDecision);
    await executor.execute({ decision: longDecision, token, gateway, action: actionFixture });
    expect(gateway.calls[0]!.receipt).toHaveLength(40);
    expect(gateway.calls[0]!.receipt.startsWith('rp-')).toBe(true);
  });
});

describe('executor: failure taxonomy (fail closed, no auto-retry)', () => {
  it('gateway validation error → EXECUTION_FAILED record, no throw escapes', async () => {
    gateway.error = Object.assign(new Error('bad amount'), { name: 'RzpValidationError' });
    const token = await issueToken();
    const rec = await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    expect(rec.status).toBe('FAILED');
    expect(rec.razorpay_order_id).toBeUndefined();
    const stored = ledger.replay().executions.get(rec.execution_id);
    expect(stored?.status).toBe('FAILED');
  });

  it('network/timeout error → EXECUTION_UNKNOWN', async () => {
    gateway.error = Object.assign(new Error('socket hangup'), { name: 'RzpNetworkError' });
    const token = await issueToken();
    const rec = await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    expect(rec.status).toBe('UNKNOWN');
  });

  it('token is still consumed on gateway failure (no silent retry path)', async () => {
    gateway.error = new Error('boom');
    const token = await issueToken();
    await executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture });
    await expect(executor.execute({ decision: ALLOW_DECISION, token, gateway, action: actionFixture })).rejects.toThrow(/used/);
    expect(gateway.calls).toHaveLength(1);
  });
});
