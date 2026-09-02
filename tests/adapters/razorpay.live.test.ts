import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { RazorpayAdapter, RzpAuthError, RzpDuplicateReceipt } from '../../src/adapters/razorpay.js';

// REAL_TEST_MODE evidence task. Runs ONLY when explicitly enabled AND keys
// exist; default `npm test` never touches the network.
function loadEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

const ENABLED =
  process.env.RZP_LIVE === '1' && Boolean(process.env.RZP_KEY_ID) && Boolean(process.env.RZP_KEY_SECRET);

describe.skipIf(!ENABLED)('RazorpayAdapter LIVE (REAL_TEST_MODE)', () => {
  let adapter: RazorpayAdapter;

  beforeAll(() => {
    loadEnv();
    adapter = new RazorpayAdapter({
      keyId: process.env.RZP_KEY_ID!,
      keySecret: process.env.RZP_KEY_SECRET!,
    });
  });

  it('creates a real test-mode order', async () => {
    const receipt = `rp-live-${Date.now()}`;
    const order = await adapter.createOrder({ amount_paise: 100_00, currency: 'INR', receipt });
    expect(order.id).toMatch(/^order_/);
    expect(order.status).toBe('created');
    expect(order.amount).toBe(100_00);
    console.log(`REAL_TEST_MODE order created: ${order.id} receipt=${receipt}`);
  });

  it('rejects a duplicate receipt (F3, live)', async () => {
    const receipt = `rp-live-dup-${Date.now()}`;
    await adapter.createOrder({ amount_paise: 100_00, currency: 'INR', receipt });
    await expect(adapter.createOrder({ amount_paise: 100_00, currency: 'INR', receipt })).rejects.toBeInstanceOf(RzpDuplicateReceipt);
  });

  it('maps bad credentials to RzpAuthError', async () => {
    const bad = new RazorpayAdapter({ keyId: 'rzp_test_invalid', keySecret: 'invalid' });
    await expect(bad.createOrder({ amount_paise: 100_00, currency: 'INR', receipt: `rp-bad-${Date.now()}` })).rejects.toBeInstanceOf(RzpAuthError);
  });
});
