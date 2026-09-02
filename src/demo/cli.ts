import { existsSync, readFileSync } from 'node:fs';
import { runDemo, CountingGateway } from './scenario.js';
import { RazorpayAdapter } from '../adapters/razorpay.js';

// npm run demo — hero demo (DM1–DM6). Live mode requires RZP_KEY_ID /
// RZP_KEY_SECRET in .env; otherwise it falls back to dry-run (SYNTHETIC).
function loadEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

loadEnv();
const dry = process.argv.includes('--dry');
const hasKeys = Boolean(process.env['RZP_KEY_ID']) && Boolean(process.env['RZP_KEY_SECRET']);
const mode: 'live' | 'dry' = !dry && hasKeys ? 'live' : 'dry';
if (mode === 'dry' && !dry) {
  console.log('(no Razorpay keys in .env — running dry-run/SYNTHETIC; add keys for REAL_TEST_MODE)');
}

const gateway =
  mode === 'live'
    ? new CountingGateway(
        new RazorpayAdapter({ keyId: process.env['RZP_KEY_ID']!, keySecret: process.env['RZP_KEY_SECRET']! }),
      )
    : undefined;

const result = await runDemo({ mode, ...(gateway ? { gateway } : {}) });
process.exit(result.allPassed ? 0 : 1);
