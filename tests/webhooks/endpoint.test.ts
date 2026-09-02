import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { buildWebhookApp } from '../../src/webhooks/endpoint.js';
import { JsonlLedger } from '../../src/core/ledger.js';

const SECRET = 'whsec_test_secret';
const T0 = 1_757_000_000_000;

const sign = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const EVENT_BODY = JSON.stringify({
  entity: 'event',
  account_id: 'acc_test',
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_1', order_id: 'order_TEST123' } } },
  created_at: 1_757_000_005,
});

let dir: string;
let ledger: JsonlLedger;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rp-wh-'));
  ledger = new JsonlLedger(join(dir, 'ledger.jsonl'), () => T0);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const app = () => buildWebhookApp({ ledger, secret: SECRET, clock: () => T0 });

function postEvent(opts: { body: string; sig?: string; eventId?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.sig !== undefined) headers['x-razorpay-signature'] = opts.sig;
  if (opts.eventId !== undefined) headers['x-razorpay-event-id'] = opts.eventId;
  return app().inject({ method: 'POST', url: '/webhooks/razorpay', headers, payload: opts.body });
}

describe('webhook: signature verification (I8, F5)', () => {
  it('valid signature + new event → 200 PROCESSED, linked to order', async () => {
    const res = await postEvent({ body: EVENT_BODY, sig: sign(EVENT_BODY, SECRET), eventId: 'evt_1' });
    expect(res.statusCode).toBe(200);
    const rec = ledger.replay().webhookEvents.get('evt_1');
    expect(rec?.processed).toBe('PROCESSED');
    expect(rec?.signature_valid).toBe(true);
    expect(rec?.event_type).toBe('payment.captured');
    expect(rec?.linked_order_id).toBe('order_TEST123');
  });

  it('tampered body → 401 + REJECTED record, no state change', async () => {
    const sig = sign(EVENT_BODY, SECRET);
    const tampered = EVENT_BODY.replace('payment.captured', 'payment.failed');
    const res = await postEvent({ body: tampered, sig, eventId: 'evt_tamper' });
    expect(res.statusCode).toBe(401);
    const rec = ledger.replay().webhookEvents.get('evt_tamper');
    expect(rec?.processed).toBe('REJECTED');
    expect(rec?.signature_valid).toBe(false);
  });

  it('re-serialized body (different key order) fails verification — raw-body proof', async () => {
    const original = '{"b":2,"a":1}';
    const sig = sign(original, SECRET);
    const restringified = '{"a":1,"b":2}';
    const res = await postEvent({ body: restringified, sig, eventId: 'evt_raw' });
    expect(res.statusCode).toBe(401);
    expect(ledger.replay().webhookEvents.get('evt_raw')?.processed).toBe('REJECTED');
  });

  it('missing signature header → 401', async () => {
    const res = await postEvent({ body: EVENT_BODY, eventId: 'evt_nosig' });
    expect(res.statusCode).toBe(401);
  });

  it('wrong secret → 401', async () => {
    const res = await postEvent({ body: EVENT_BODY, sig: sign(EVENT_BODY, 'wrong-secret'), eventId: 'evt_wrong' });
    expect(res.statusCode).toBe(401);
  });
});

describe('webhook: dedupe (I7, F6)', () => {
  it('same event-id delivered twice → one PROCESSED + one DUPLICATE, both 200', async () => {
    const sig = sign(EVENT_BODY, SECRET);
    const first = await postEvent({ body: EVENT_BODY, sig, eventId: 'evt_dup' });
    const second = await postEvent({ body: EVENT_BODY, sig, eventId: 'evt_dup' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const events = [...ledger.replay().webhookEvents.values()];
    const processed = events.filter((e) => e.event_id === 'evt_dup');
    expect(processed).toHaveLength(1);
    expect(processed[0]?.processed).toBe('PROCESSED');
    // duplicate recorded under derived key
    const dup = events.find((e) => e.processed === 'DUPLICATE');
    expect(dup).toBeDefined();
  });
});

describe('webhook: out-of-order tolerance (F7)', () => {
  it('events arriving in reverse logical order are both recorded', async () => {
    const captured = EVENT_BODY;
    const paid = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test',
      event: 'order.paid',
      payload: { order: { entity: { id: 'order_TEST123' } } },
      created_at: 1_757_000_004,
    });
    const r1 = await postEvent({ body: captured, sig: sign(captured, SECRET), eventId: 'evt_c' });
    const r2 = await postEvent({ body: paid, sig: sign(paid, SECRET), eventId: 'evt_p' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const state = ledger.replay().webhookEvents;
    expect(state.get('evt_c')?.processed).toBe('PROCESSED');
    expect(state.get('evt_p')?.processed).toBe('PROCESSED');
    expect(state.get('evt_p')?.linked_order_id).toBe('order_TEST123');
  });
});
