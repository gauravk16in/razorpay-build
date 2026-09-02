import { describe, it, expect } from 'vitest';
import type {
  Gate,
  RazorpayGateway,
  IntentProvider,
  Ledger,
  LedgerState,
  RzpOrder,
  VerifierInput,
  CreateOrderRequest,
} from '../../src/contracts/interfaces.js';
import * as F from '../../src/contracts/fixtures.js';

// Compile-time acceptance: stubs must satisfy the frozen interfaces.
class StubGate implements Gate {
  decide(_input: VerifierInput) {
    return F.decisionFixture;
  }
}

class StubGateway implements RazorpayGateway {
  async createOrder(_req: CreateOrderRequest): Promise<RzpOrder> {
    return F.rzpOrderFixture;
  }
  async fetchOrder(_id: string): Promise<RzpOrder> {
    return F.rzpOrderFixture;
  }
  async fetchAllOrders(): Promise<RzpOrder[]> {
    return [F.rzpOrderFixture];
  }
}

class StubIntent implements IntentProvider {
  async extract(_text: string) {
    return { kind: 'constraints', draft: F.constraintsDraftFixture } as const;
  }
}

class StubLedger implements Ledger {
  async append(_type: string, _payload: unknown) {
    return F.ledgerEntryFixture;
  }
  replay(): LedgerState {
    return {
      mandates: new Map(),
      decisions: new Map(),
      tokens: new Map(),
      executions: new Map(),
      webhookEvents: new Map(),
    };
  }
  verifyChain() {
    return true;
  }
}

describe('contracts: interface stubs', () => {
  it('Gate stub returns a Decision', () => {
    const input: VerifierInput = {
      mandate: F.mandateFixture,
      action: F.actionFixture,
      fetched: { ok: true, snapshot: F.snapshotFixture },
      now: 1_757_000_010_000,
    };
    expect(new StubGate().decide(input).verdict).toBe('ALLOW');
  });

  it('RazorpayGateway stub round-trips an order', async () => {
    const order = await new StubGateway().createOrder({
      amount_paise: 199_900,
      currency: 'INR',
      receipt: 'rp-dec_0001',
    });
    expect(order.id).toMatch(/^order_/);
  });

  it('IntentProvider stub returns constraints', async () => {
    const res = await new StubIntent().extract('buy headphones under 2000');
    expect(res.kind).toBe('constraints');
  });

  it('Ledger stub appends and verifies', async () => {
    const ledger = new StubLedger();
    expect((await ledger.append('genesis', {})).seq).toBe(0);
    expect(ledger.verifyChain()).toBe(true);
    expect(ledger.replay().mandates.size).toBe(0);
  });
});
