import { describe, it, expect } from 'vitest';
import { buildMerchantApp } from '../../src/merchant/server.js';
import { CheckoutSnapshotSchema } from '../../src/contracts/schemas.js';
import { snapshotHash } from '../../src/core/crypto.js';

const T0 = 1_757_000_000_000;

function app() {
  return buildMerchantApp({ clock: () => T0 });
}

describe('merchant fixture: cart endpoint', () => {
  it('GET /merchant/cart returns a schema-valid CheckoutSnapshot', async () => {
    const res = await app().inject({ method: 'GET', url: '/merchant/cart' });
    expect(res.statusCode).toBe(200);
    const parsed = CheckoutSnapshotSchema.safeParse(res.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.merchant_id).toBe('sonicstore');
    expect(parsed.data?.amount_paise).toBe(199_900);
    expect(parsed.data?.fetched_at).toBe(T0);
  });

  it('every response carries the SYNTHETIC evidence label header', async () => {
    const res = await app().inject({ method: 'GET', url: '/merchant/cart' });
    expect(res.headers['x-rupeeproof-evidence']).toBe('SYNTHETIC');
  });

  it('two fetches of an unchanged cart yield identical snapshot hashes', async () => {
    const a = await app().inject({ method: 'GET', url: '/merchant/cart' });
    const b = await app().inject({ method: 'GET', url: '/merchant/cart' });
    expect(snapshotHash(a.json())).toBe(snapshotHash(b.json()));
  });
});

describe('merchant fixture: price mutation (demo control)', () => {
  it('POST /merchant/__admin__/price changes the next cart response', async () => {
    const instance = app();
    const before = await instance.inject({ method: 'GET', url: '/merchant/cart' });
    const admin = await instance.inject({
      method: 'POST',
      url: '/merchant/__admin__/price',
      payload: { amount_paise: 189_900 },
    });
    expect(admin.statusCode).toBe(200);
    const after = await instance.inject({ method: 'GET', url: '/merchant/cart' });
    expect(after.json().amount_paise).toBe(189_900);
    expect(snapshotHash(after.json())).not.toBe(snapshotHash(before.json()));
  });

  it('rejects invalid admin payloads', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/merchant/__admin__/price',
      payload: { amount_paise: -50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('admin route also carries the SYNTHETIC label', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/merchant/__admin__/price',
      payload: { amount_paise: 189_900 },
    });
    expect(res.headers['x-rupeeproof-evidence']).toBe('SYNTHETIC');
  });
});
