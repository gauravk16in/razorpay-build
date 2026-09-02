import { createHmac } from 'node:crypto';
import { MANDATE_TTL_MS } from '../core/mandate.js';
import { SNAPSHOT_TTL_MS } from '../core/verifier.js';
import { CheckoutSnapshotSchema, type Decision, type ProposedAction } from '../contracts/schemas.js';
import {
  actionFor,
  issueForCurrentCart,
  runAction,
  WEBHOOK_SECRET,
  type WiredSystem,
} from './wiring.js';
import type { Scenario, ScenarioObservation } from './assert.js';

const sign = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

function webhookBody(event: string, orderId: string): string {
  if (event === 'order.paid') {
    return JSON.stringify({ entity: 'event', event, payload: { order: { entity: { id: orderId } } } });
  }
  return JSON.stringify({
    entity: 'event',
    event,
    payload: { payment: { entity: { id: 'pay_1', order_id: orderId } } },
  });
}

async function deliverWebhook(
  sys: WiredSystem,
  body: string,
  opts: { eventId: string; badSignature?: boolean },
): Promise<{ status: number }> {
  const sig = opts.badSignature ? 'f'.repeat(64) : sign(body, WEBHOOK_SECRET);
  const res = await sys.webhooks.inject({
    method: 'POST',
    url: '/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': sig,
      'x-razorpay-event-id': opts.eventId,
    },
    payload: body,
  });
  return { status: res.statusCode };
}

const obs = async (
  sys: WiredSystem,
  decisions: Decision[],
  webhookOutcomes?: Array<{ status: number; processed: string }>,
): Promise<ScenarioObservation> => ({
  decisions,
  razorpayCalls: sys.gateway.createOrderCalls,
  executionsCreated: sys.ledger.replay().executions.size,
  ...(webhookOutcomes ? { webhookOutcomes } : {}),
});

const lastExecutionOrderId = (sys: WiredSystem): string =>
  [...sys.ledger.replay().executions.values()][0]!.razorpay_order_id!;

// The frozen adversarial classes (PLAN.md §08 / T13A). Each scenario runs the
// REAL pipeline (fixture merchant, fake gateway, real core) end-to-end.
export const SCENARIOS: Scenario[] = [
  {
    id: 'valid-purchase',
    class: 'valid',
    expected: { verdict: 'ALLOW', reason_codes: ['OK'], razorpayCalls: 1, executionsCreated: 1 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
      return obs(sys, [d]);
    },
  },
  {
    id: 'amount-mutation',
    class: 'amount-mutation',
    expected: { verdict: 'DENY', reason_codes: ['AMOUNT_MISMATCH'], razorpayCalls: 0, executionsCreated: 0 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      // under-cap mutation: isolates AMOUNT_MISMATCH (over-cap is its own class)
      const attack: ProposedAction = { ...actionFor(sys, mandate, snapshot), amount_paise: 189_900 };
      const d = await runAction(sys, mandate, attack);
      return obs(sys, [d]);
    },
  },
  {
    id: 'merchant-substitution',
    class: 'merchant-substitution',
    expected: { verdict: 'DENY', reason_codes: ['MERCHANT_MISMATCH'], razorpayCalls: 0, executionsCreated: 0 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot, { merchant_id: 'evilstore' }));
      return obs(sys, [d]);
    },
  },
  {
    id: 'currency-swap',
    class: 'currency-swap',
    expected: { verdict: 'DENY', reason_codes: ['CURRENCY_MISMATCH'], razorpayCalls: 0, executionsCreated: 0 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot, { currency: 'USD' }));
      return obs(sys, [d]);
    },
  },
  {
    id: 'items-mutation',
    class: 'items-mutation',
    expected: { verdict: 'DENY', reason_codes: ['ITEMS_MISMATCH'], razorpayCalls: 0, executionsCreated: 0 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const items = [{ ...snapshot.items[0]!, qty: 2 }];
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot, { items }));
      return obs(sys, [d]);
    },
  },
  {
    id: 'over-limit',
    class: 'over-limit',
    expected: { verdict: 'DENY', razorpayCalls: 0, executionsCreated: 0 },
    check: (o) => (o.decisions[0]?.reason_codes.includes('OVER_LIMIT') ? [] : ['expected OVER_LIMIT']),
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot, { amount_paise: 250_000 }));
      return obs(sys, [d]);
    },
  },
  {
    id: 'replay',
    class: 'replay',
    expected: { verdict: 'DENY', reason_codes: ['MANDATE_CONSUMED'], razorpayCalls: 1, executionsCreated: 1 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const action = actionFor(sys, mandate, snapshot);
      const first = await runAction(sys, mandate, action);
      const consumed = sys.mandates.getMandate(mandate.mandate_id);
      const second = await runAction(sys, consumed, action);
      return obs(sys, [first, second]);
    },
  },
  {
    id: 'expired-mandate',
    class: 'expired-mandate',
    expected: { verdict: 'DENY', razorpayCalls: 0, executionsCreated: 0 },
    check: (o) => (o.decisions[0]?.reason_codes.includes('MANDATE_EXPIRED') ? [] : ['expected MANDATE_EXPIRED']),
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      sys.clock.now += MANDATE_TTL_MS + 1;
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
      return obs(sys, [d]);
    },
  },
  {
    id: 'stale-snapshot',
    class: 'stale-snapshot',
    expected: { verdict: 'DENY', razorpayCalls: 0, executionsCreated: 0 },
    check: (o) => (o.decisions[0]?.reason_codes.includes('STALE_SNAPSHOT') ? [] : ['expected STALE_SNAPSHOT']),
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      // merchant clock frozen at T0; system clock advances past snapshot TTL
      sys.clock.now += SNAPSHOT_TTL_MS + 1_000;
      const d = await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
      return obs(sys, [d]);
    },
  },
  {
    id: 'checkout-change-reapproval',
    class: 'checkout-change',
    expected: { verdict: 'ALLOW', reason_codes: ['OK'], razorpayCalls: 1, executionsCreated: 1 },
    check: (o) => {
      const first = o.decisions[0];
      if (!first || first.verdict !== 'DENY') return ['phase 1: expected DENY'];
      if (first.reason_codes.join(',') !== 'CHECKOUT_CHANGED') return ['phase 1: expected CHECKOUT_CHANGED only'];
      if (first.next_action !== 'REQUIRE_REAPPROVAL') return ['phase 1: expected REQUIRE_REAPPROVAL'];
      return [];
    },
    run: async (sys) => {
      const { mandate } = await issueForCurrentCart(sys);
      // merchant changes price AFTER approval
      await sys.merchant.inject({ method: 'POST', url: '/merchant/__admin__/price', payload: { amount_paise: 189_900 } });
      // honest agent proposes from the NEW checkout state
      const res1 = await sys.merchant.inject({ method: 'GET', url: '/merchant/cart' });
      const newSnapshot = CheckoutSnapshotSchema.parse(res1.json());
      const d1 = await runAction(sys, mandate, actionFor(sys, mandate, newSnapshot));
      // re-approval: user approves new checkout state → mandate v2
      const v2 = await sys.mandates.supersede(mandate.mandate_id, mandate.constraints, newSnapshot);
      const d2 = await runAction(sys, v2, actionFor(sys, v2, newSnapshot));
      return obs(sys, [d1, d2]);
    },
  },
  {
    id: 'tampered-mandate',
    class: 'tampered-mandate',
    expected: { verdict: 'DENY', reason_codes: ['MANDATE_INVALID'], razorpayCalls: 0, executionsCreated: 0 },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      const tampered = { ...mandate, constraints: { ...mandate.constraints, max_amount_paise: 9_999_999 } };
      const d = await runAction(sys, tampered, actionFor(sys, mandate, snapshot));
      return obs(sys, [d]);
    },
  },
  {
    id: 'webhook-bad-signature',
    class: 'webhook-bad-signature',
    expected: { razorpayCalls: 0, webhookOutcomes: [{ status: 401, processed: 'REJECTED' }] },
    run: async (sys) => {
      const body = webhookBody('payment.captured', 'order_FAKE000001');
      const { status } = await deliverWebhook(sys, body, { eventId: 'evt_bad', badSignature: true });
      const processed = sys.ledger.replay().webhookEvents.get('evt_bad')?.processed ?? 'MISSING';
      return obs(sys, [], [{ status, processed }]);
    },
  },
  {
    id: 'duplicate-webhook',
    class: 'duplicate-webhook',
    expected: {
      razorpayCalls: 1,
      webhookOutcomes: [
        { status: 200, processed: 'PROCESSED' },
        { status: 200, processed: 'DUPLICATE' },
      ],
    },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
      const orderId = lastExecutionOrderId(sys);
      const body = webhookBody('payment.captured', orderId);
      const first = await deliverWebhook(sys, body, { eventId: 'evt_dup' });
      const p1 = sys.ledger.replay().webhookEvents.get('evt_dup')?.processed ?? 'MISSING';
      const second = await deliverWebhook(sys, body, { eventId: 'evt_dup' });
      const p2 = sys.ledger.replay().webhookEvents.get('evt_dup#dup')?.processed ?? 'MISSING';
      return obs(sys, [], [
        { status: first.status, processed: p1 },
        { status: second.status, processed: p2 },
      ]);
    },
  },
  {
    id: 'out-of-order-webhook',
    class: 'out-of-order-webhook',
    expected: {
      razorpayCalls: 1,
      webhookOutcomes: [
        { status: 200, processed: 'PROCESSED' },
        { status: 200, processed: 'PROCESSED' },
      ],
    },
    run: async (sys) => {
      const { mandate, snapshot } = await issueForCurrentCart(sys);
      await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
      const orderId = lastExecutionOrderId(sys);
      // payment.captured arrives BEFORE order.paid (legal per F7)
      const b1 = webhookBody('payment.captured', orderId);
      const b2 = webhookBody('order.paid', orderId);
      const r1 = await deliverWebhook(sys, b1, { eventId: 'evt_cap' });
      const r2 = await deliverWebhook(sys, b2, { eventId: 'evt_paid' });
      const state = sys.ledger.replay().webhookEvents;
      return obs(sys, [], [
        { status: r1.status, processed: state.get('evt_cap')?.processed ?? 'MISSING' },
        { status: r2.status, processed: state.get('evt_paid')?.processed ?? 'MISSING' },
      ]);
    },
  },
];
