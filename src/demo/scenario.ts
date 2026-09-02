import { createHmac } from 'node:crypto';
import { rmSync } from 'node:fs';
import type { RazorpayGateway } from '../contracts/interfaces.js';
import { CheckoutSnapshotSchema, type CheckoutSnapshot, type ProposedAction } from '../contracts/schemas.js';
import { StubIntentProvider } from '../adapters/intent.stub.js';
import { actionFor, buildSystem, issueForCurrentCart, runAction, WEBHOOK_SECRET, type WiredSystem } from '../harness/wiring.js';
import { renderBeat, type BeatResult } from './format.js';

const HERO_INTENT = 'Buy these headphones from SonicStore for no more than ₹2,000.';

export interface DemoResult {
  mode: 'live' | 'dry';
  allPassed: boolean;
  beats: BeatResult[];
  stats: { razorpayCalls: number; ledgerEntries: number; chainValid: boolean };
}

// Counting wrapper so the demo can run against the REAL Razorpay adapter
// (live) or the in-memory fake (dry) with identical call accounting.
export class CountingGateway implements RazorpayGateway {
  createOrderCalls = 0;
  constructor(private readonly inner: RazorpayGateway) {}
  async createOrder(req: Parameters<RazorpayGateway['createOrder']>[0]) {
    this.createOrderCalls++;
    return this.inner.createOrder(req);
  }
  fetchOrder(id: string) {
    return this.inner.fetchOrder(id);
  }
  fetchAllOrders() {
    return this.inner.fetchAllOrders();
  }
}

const sign = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

export async function runDemo(opts: {
  mode: 'live' | 'dry';
  gateway?: RazorpayGateway;
  print?: (s: string) => void;
}): Promise<DemoResult> {
  const print = opts.print ?? console.log;
  const sys = buildSystem();
  if (opts.gateway) sys.gateway = opts.gateway as typeof sys.gateway;
  const label = opts.mode === 'live' ? 'REAL_TEST_MODE' : 'SYNTHETIC';
  const beats: BeatResult[] = [];
  const intent = new StubIntentProvider();

  const callsBefore = () => sys.gateway.createOrderCalls;

  async function freshMandate(): Promise<{ mandate: Awaited<ReturnType<typeof issueForCurrentCart>>['mandate']; snapshot: CheckoutSnapshot }> {
    const res = await sys.merchant.inject({ method: 'GET', url: '/merchant/cart' });
    const snapshot = CheckoutSnapshotSchema.parse(res.json());
    const mandate = await sys.mandates.issueMandate(
      { merchant_id: 'sonicstore', merchant_base_url: 'http://localhost:4010/merchant', max_amount_paise: 200_000, currency: 'INR' },
      snapshot,
    );
    return { mandate, snapshot };
  }

  const action = (m: string, s: CheckoutSnapshot, o: Partial<ProposedAction> = {}) =>
    actionFor(sys, { mandate_id: m } as never, s, o);

  try {
    print('RupeeProof demo — "AI paid exactly what the user authorized"');
    print(`mode=${opts.mode}  intent="${HERO_INTENT}"`);

    // Intent extraction (AI interprets; never authorizes)
    const extracted = await intent.extract(HERO_INTENT);
    print(`intent → ${extracted.kind === 'constraints' ? JSON.stringify(extracted.draft) : 'clarify'}`);

    // DM1 — valid purchase
    {
      const { mandate, snapshot } = await freshMandate();
      const d = await runAction(sys, mandate, action(mandate.mandate_id, snapshot));
      const executions = [...sys.ledger.replay().executions.values()];
      const orderId = executions.at(-1)?.razorpay_order_id;
      beats.push({
        id: 'DM1',
        title: 'Valid action accepted',
        label,
        ok: d.verdict === 'ALLOW' && Boolean(orderId),
        decisions: [d],
        orderIds: orderId ? [orderId] : [],
        notes: [],
      });
    }

    // DM2 — amount mutation
    {
      const { mandate, snapshot } = await freshMandate();
      const before = callsBefore();
      const d = await runAction(sys, mandate, action(mandate.mandate_id, snapshot, { amount_paise: 250_000 }));
      beats.push({
        id: 'DM2',
        title: 'Amount mutation rejected',
        label,
        ok: d.verdict === 'DENY' && d.reason_codes.includes('AMOUNT_MISMATCH') && callsBefore() === before,
        decisions: [d],
        orderIds: [],
        notes: [`razorpay calls delta: ${callsBefore() - before} (must be 0)`],
      });
    }

    // DM3 — merchant substitution
    {
      const { mandate, snapshot } = await freshMandate();
      const d = await runAction(sys, mandate, action(mandate.mandate_id, snapshot, { merchant_id: 'evilstore' }));
      beats.push({
        id: 'DM3',
        title: 'Merchant substitution rejected',
        label,
        ok: d.verdict === 'DENY' && d.reason_codes.includes('MERCHANT_MISMATCH'),
        decisions: [d],
        orderIds: [],
        notes: [],
      });
    }

    // DM4 — replay
    {
      const { mandate, snapshot } = await freshMandate();
      const a = action(mandate.mandate_id, snapshot);
      const d1 = await runAction(sys, mandate, a);
      const orderId = [...sys.ledger.replay().executions.values()].at(-1)?.razorpay_order_id;
      const consumed = sys.mandates.getMandate(mandate.mandate_id);
      const d2 = await runAction(sys, consumed, a);
      beats.push({
        id: 'DM4',
        title: 'Replay rejected',
        label,
        ok: d1.verdict === 'ALLOW' && d2.verdict === 'DENY' && d2.reason_codes.includes('MANDATE_CONSUMED'),
        decisions: [d1, d2],
        orderIds: orderId ? [orderId] : [],
        notes: [],
      });
    }

    // DM5 — checkout change → re-approval
    {
      const { mandate } = await freshMandate();
      await sys.merchant.inject({ method: 'POST', url: '/merchant/__admin__/price', payload: { amount_paise: 189_900 } });
      const res = await sys.merchant.inject({ method: 'GET', url: '/merchant/cart' });
      const newSnapshot = CheckoutSnapshotSchema.parse(res.json());
      const d1 = await runAction(sys, mandate, action(mandate.mandate_id, newSnapshot));
      const v2 = await sys.mandates.supersede(mandate.mandate_id, mandate.constraints, newSnapshot);
      const d2 = await runAction(sys, v2, action(v2.mandate_id, newSnapshot));
      const orderId = [...sys.ledger.replay().executions.values()].at(-1)?.razorpay_order_id;
      beats.push({
        id: 'DM5',
        title: 'Checkout change → deny → re-approval → accepted',
        label,
        ok:
          d1.verdict === 'DENY' &&
          d1.reason_codes.join() === 'CHECKOUT_CHANGED' &&
          d1.next_action === 'REQUIRE_REAPPROVAL' &&
          d2.verdict === 'ALLOW',
        decisions: [d1, d2],
        orderIds: orderId ? [orderId] : [],
        notes: ['price changed ₹1,999 → ₹1,899 after approval'],
      });
    }

    // DM6 — duplicate webhook (REPLAYED delivery)
    {
      const orderId = [...sys.ledger.replay().executions.values()].at(-1)?.razorpay_order_id ?? 'order_none';
      const body = JSON.stringify({
        entity: 'event',
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_demo', order_id: orderId } } },
      });
      const headers = {
        'content-type': 'application/json',
        'x-razorpay-signature': sign(body, WEBHOOK_SECRET),
        'x-razorpay-event-id': 'evt_demo_1',
      };
      const r1 = await sys.webhooks.inject({ method: 'POST', url: '/webhooks/razorpay', headers, payload: body });
      const r2 = await sys.webhooks.inject({ method: 'POST', url: '/webhooks/razorpay', headers, payload: body });
      const state = sys.ledger.replay().webhookEvents;
      const p1 = state.get('evt_demo_1')?.processed ?? 'MISSING';
      const p2 = state.get('evt_demo_1#dup')?.processed ?? 'MISSING';
      beats.push({
        id: 'DM6',
        title: 'Duplicate webhook deduplicated',
        label: 'REPLAYED',
        ok: r1.statusCode === 200 && r2.statusCode === 200 && p1 === 'PROCESSED' && p2 === 'DUPLICATE',
        decisions: [],
        orderIds: [],
        notes: [`delivery 1: ${p1} (${r1.statusCode})`, `delivery 2: ${p2} (${r2.statusCode})`],
      });
    }

    const stats = {
      razorpayCalls: sys.gateway.createOrderCalls,
      ledgerEntries: sys.ledger.replay().decisions.size,
      chainValid: sys.ledger.verifyChain(),
    };

    for (const b of beats) print(renderBeat(b));
    const allPassed = beats.every((b) => b.ok);
    print(
      `\nsummary: ${beats.filter((b) => b.ok).length}/6 beats ✓ · razorpay calls=${stats.razorpayCalls} · ledger chain ${stats.chainValid ? 'VALID' : 'BROKEN'} · mode=${opts.mode}`,
    );
    return { mode: opts.mode, allPassed, beats, stats };
  } finally {
    rmSync(sys.dir, { recursive: true, force: true });
  }
}
