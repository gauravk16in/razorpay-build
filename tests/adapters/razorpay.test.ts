import { describe, it, expect } from 'vitest';
import {
  RazorpayAdapter,
  RzpAuthError,
  RzpDuplicateReceipt,
  RzpNetworkError,
  RzpUnknownError,
  RzpValidationError,
} from '../../src/adapters/razorpay.js';
import { FakeRazorpay } from '../../src/adapters/razorpay.fake.js';

const T0 = 1_757_000_000_000; // ms
const T0_SECONDS = 1_757_000_000;

describe('FakeRazorpay', () => {
  const fake = () => new FakeRazorpay({ clock: () => T0 });

  it('create → fetch round-trip with documented fields (F1–F4)', async () => {
    const gw = fake();
    const order = await gw.createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'rp-dec_1' });
    expect(order.id).toMatch(/^order_/);
    expect(order.status).toBe('created');
    expect(order.amount).toBe(199_900);
    expect(order.currency).toBe('INR');
    expect(order.receipt).toBe('rp-dec_1');
    expect(order.created_at).toBe(T0_SECONDS);
    expect(await gw.fetchOrder(order.id)).toEqual(order);
  });

  it('receipt idempotency: duplicate receipt → RzpDuplicateReceipt (F3)', async () => {
    const gw = fake();
    await gw.createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'rp-dup' });
    await expect(gw.createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'rp-dup' })).rejects.toBeInstanceOf(RzpDuplicateReceipt);
  });

  it('amount below minimum (100 paise) → RzpValidationError', async () => {
    await expect(fake().createOrder({ amount_paise: 50, currency: 'INR', receipt: 'rp-low' })).rejects.toBeInstanceOf(RzpValidationError);
  });

  it('fetchAllOrders returns created orders (reconciliation source)', async () => {
    const gw = fake();
    await gw.createOrder({ amount_paise: 100, currency: 'INR', receipt: 'rp-a' });
    await gw.createOrder({ amount_paise: 200, currency: 'INR', receipt: 'rp-b' });
    expect(await gw.fetchAllOrders()).toHaveLength(2);
  });
});

describe('RazorpayAdapter (mock fetch, offline)', () => {
  const adapter = (fetchImpl: typeof fetch) =>
    new RazorpayAdapter({ keyId: 'rzp_test_key', keySecret: 'secret', fetchImpl });

  const okOrderBody = {
    id: 'order_RB58MiP5SPFYyM',
    entity: 'order',
    amount: 199900,
    currency: 'INR',
    receipt: 'rp-dec_1',
    status: 'created',
    created_at: T0_SECONDS,
  };

  const mockResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('constructs the exact documented request (F1): URL, Basic auth, paise body', async () => {
    let seen: { url: string; auth: string | null; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seen = {
        url: String(url),
        auth: (init?.headers as Record<string, string>)?.['authorization'] ?? null,
        body: JSON.parse(String(init?.body)),
      };
      return mockResponse(200, okOrderBody);
    }) as typeof fetch;

    const order = await adapter(fetchImpl).createOrder({
      amount_paise: 199_900,
      currency: 'INR',
      receipt: 'rp-dec_1',
      notes: { decision_id: 'dec_1' },
    });

    expect(seen!.url).toBe('https://api.razorpay.com/v1/orders');
    expect(seen!.auth).toBe(`Basic ${Buffer.from('rzp_test_key:secret').toString('base64')}`);
    expect(seen!.body).toEqual({ amount: 199_900, currency: 'INR', receipt: 'rp-dec_1', notes: { decision_id: 'dec_1' } });
    expect(order.id).toBe('order_RB58MiP5SPFYyM');
    expect(order.status).toBe('created');
    expect(order.created_at).toBe(T0_SECONDS);
  });

  it('401 → RzpAuthError', async () => {
    const fetchImpl = (async () => mockResponse(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } })) as typeof fetch;
    await expect(adapter(fetchImpl).createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'r1' })).rejects.toBeInstanceOf(RzpAuthError);
  });

  it('400 with duplicate description → RzpDuplicateReceipt', async () => {
    const fetchImpl = (async () => mockResponse(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Duplicate request. This request has already been processed.' } })) as typeof fetch;
    await expect(adapter(fetchImpl).createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'r1' })).rejects.toBeInstanceOf(RzpDuplicateReceipt);
  });

  it('400 other → RzpValidationError', async () => {
    const fetchImpl = (async () => mockResponse(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The amount must be at least INR 1.00' } })) as typeof fetch;
    await expect(adapter(fetchImpl).createOrder({ amount_paise: 50, currency: 'INR', receipt: 'r1' })).rejects.toBeInstanceOf(RzpValidationError);
  });

  it('500 → RzpUnknownError', async () => {
    const fetchImpl = (async () => mockResponse(500, {})) as typeof fetch;
    await expect(adapter(fetchImpl).createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'r1' })).rejects.toBeInstanceOf(RzpUnknownError);
  });

  it('network throw → RzpNetworkError', async () => {
    const fetchImpl = (async () => { throw new Error('socket hangup'); }) as typeof fetch;
    await expect(adapter(fetchImpl).createOrder({ amount_paise: 199_900, currency: 'INR', receipt: 'r1' })).rejects.toBeInstanceOf(RzpNetworkError);
  });

  it('fetchOrder hits /v1/orders/:id', async () => {
    let seenUrl = '';
    const fetchImpl = (async (url: unknown) => {
      seenUrl = String(url);
      return mockResponse(200, okOrderBody);
    }) as typeof fetch;
    await adapter(fetchImpl).fetchOrder('order_RB58MiP5SPFYyM');
    expect(seenUrl).toBe('https://api.razorpay.com/v1/orders/order_RB58MiP5SPFYyM');
  });

  it('fetchAllOrders maps the items array', async () => {
    const fetchImpl = (async () => mockResponse(200, { entity: 'collection', count: 1, items: [okOrderBody] })) as typeof fetch;
    const orders = await adapter(fetchImpl).fetchAllOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]!.id).toBe('order_RB58MiP5SPFYyM');
  });
});
