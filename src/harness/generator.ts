import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MANDATE_TTL_MS } from '../core/mandate.js';
import { SNAPSHOT_TTL_MS } from '../core/verifier.js';
import type { Decision } from '../contracts/schemas.js';
import { actionFor, buildSystem, issueForCurrentCart, runAction, type AnyGate, type WiredSystem } from './wiring.js';

// Seeded adversarial trace generator (T13B): volume evidence for the
// evaluation. Deterministic: no Math.random, no wall-clock, no randomUUID in
// emitted artifacts. Label: SYNTHETIC.

export const TRACE_CLASSES = [
  'valid',
  'amount-mutation',
  'merchant-substitution',
  'currency-swap',
  'items-mutation',
  'over-limit',
  'replay',
  'expired-mandate',
  'stale-snapshot',
  'checkout-change',
  'tampered-mandate',
  'over-limit-exact',
] as const;

export type TraceClass = (typeof TRACE_CLASSES)[number];

export interface TraceExpectation {
  verdict: 'ALLOW' | 'DENY';
  reason_codes: string[];
}

export interface GeneratedTrace {
  trace_id: string;
  seed: number;
  class: TraceClass;
  params: Record<string, number | string>;
  expected: TraceExpectation;
}

export interface TraceResult extends GeneratedTrace {
  observed: { verdict: string; reason_codes: string[] };
  pass: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rnd: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (rnd: () => number, arr: readonly string[]): string =>
  arr[Math.floor(rnd() * arr.length)]!;

const CAP = 200_000;
const EVIL_MERCHANTS = ['evilstore', 'shadyshop', 'fake-mart', 'notsonic'] as const;
const BAD_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED'] as const;

export function generate(seed: number, count: number): GeneratedTrace[] {
  const rnd = mulberry32(seed);
  const traces: GeneratedTrace[] = [];
  for (let i = 0; i < count; i++) {
    const cls = TRACE_CLASSES[i % TRACE_CLASSES.length]!;
    const basePrice = int(rnd, 10_000, 199_900);
    const id = `trace_${seed}_${i}`;
    const base = { trace_id: id, seed, params: { basePrice } as Record<string, number | string> };

    switch (cls) {
      case 'valid':
        traces.push({ ...base, class: cls, expected: { verdict: 'ALLOW', reason_codes: ['OK'] } });
        break;
      case 'amount-mutation': {
        let delta = int(rnd, -5_000, 5_000);
        if (delta === 0) delta = 1;
        let mutated = basePrice + delta;
        if (mutated < 100) mutated = basePrice + Math.abs(delta);
        if (mutated > CAP) mutated = basePrice - Math.abs(delta);
        if (mutated === basePrice) mutated = basePrice - 1;
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, mutatedAmount: mutated },
          expected: { verdict: 'DENY', reason_codes: ['AMOUNT_MISMATCH'] },
        });
        break;
      }
      case 'merchant-substitution':
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, evilMerchant: pick(rnd, EVIL_MERCHANTS) },
          expected: { verdict: 'DENY', reason_codes: ['MERCHANT_MISMATCH'] },
        });
        break;
      case 'currency-swap':
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, badCurrency: pick(rnd, BAD_CURRENCIES) },
          expected: { verdict: 'DENY', reason_codes: ['CURRENCY_MISMATCH'] },
        });
        break;
      case 'items-mutation':
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, qty: int(rnd, 2, 5) },
          expected: { verdict: 'DENY', reason_codes: ['ITEMS_MISMATCH'] },
        });
        break;
      case 'over-limit': {
        const mutated = CAP + int(rnd, 1, 50_000);
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, mutatedAmount: mutated },
          expected: { verdict: 'DENY', reason_codes: ['AMOUNT_MISMATCH', 'OVER_LIMIT'] },
        });
        break;
      }
      case 'replay':
        traces.push({
          ...base,
          class: cls,
          expected: { verdict: 'DENY', reason_codes: ['MANDATE_CONSUMED'] },
        });
        break;
      case 'expired-mandate': {
        const offset = int(rnd, 1, 300_000);
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, offset },
          expected: { verdict: 'DENY', reason_codes: ['MANDATE_EXPIRED', 'STALE_SNAPSHOT'] },
        });
        break;
      }
      case 'stale-snapshot': {
        const offset = int(rnd, 1_000, 300_000);
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, offset },
          expected: { verdict: 'DENY', reason_codes: ['STALE_SNAPSHOT'] },
        });
        break;
      }
      case 'checkout-change': {
        let newPrice = int(rnd, 10_000, 199_900);
        if (newPrice === basePrice) newPrice = basePrice === 10_000 ? 10_100 : basePrice - 100;
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, newPrice },
          expected: { verdict: 'DENY', reason_codes: ['CHECKOUT_CHANGED'] },
        });
        break;
      }
      case 'tampered-mandate':
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, newCap: int(rnd, 200_001, 9_999_999) },
          expected: { verdict: 'DENY', reason_codes: ['MANDATE_INVALID'] },
        });
        break;
      case 'over-limit-exact': {
        const newPrice = CAP + int(rnd, 1, 50_000);
        traces.push({
          ...base,
          class: cls,
          params: { basePrice, newPrice },
          expected: { verdict: 'DENY', reason_codes: ['CHECKOUT_CHANGED', 'OVER_LIMIT'] },
        });
        break;
      }
    }
  }
  return traces;
}

export async function runTrace(trace: GeneratedTrace, gate?: AnyGate): Promise<TraceResult> {
  const sys = buildSystem();
  if (gate) sys.gate = gate;
  try {
    const decision = await executeTrace(sys, trace);
    const observed = {
      verdict: decision.verdict,
      reason_codes: [...decision.reason_codes].sort(),
    };
    const expected = { verdict: trace.expected.verdict, reason_codes: [...trace.expected.reason_codes].sort() };
    const pass =
      observed.verdict === expected.verdict &&
      JSON.stringify(observed.reason_codes) === JSON.stringify(expected.reason_codes);
    return { ...trace, observed, pass };
  } finally {
    rmSync(sys.dir, { recursive: true, force: true });
  }
}

async function executeTrace(sys: WiredSystem, trace: GeneratedTrace): Promise<Decision> {
  const p = trace.params;
  await sys.merchant.inject({
    method: 'POST',
    url: '/merchant/__admin__/price',
    payload: { amount_paise: p['basePrice'] },
  });
  const { mandate, snapshot } = await issueForCurrentCart(sys);

  switch (trace.class) {
    case 'valid':
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot));
    case 'amount-mutation':
    case 'over-limit':
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot, { amount_paise: p['mutatedAmount'] as number }));
    case 'merchant-substitution':
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot, { merchant_id: p['evilMerchant'] as string }));
    case 'currency-swap':
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot, { currency: p['badCurrency'] as string }));
    case 'items-mutation':
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot, {
        items: [{ ...snapshot.items[0]!, qty: p['qty'] as number }],
      }));
    case 'replay': {
      const action = actionFor(sys, mandate, snapshot);
      await runAction(sys, mandate, action);
      const consumed = sys.mandates.getMandate(mandate.mandate_id);
      return runAction(sys, consumed, action);
    }
    case 'expired-mandate':
      sys.clock.now += MANDATE_TTL_MS + (p['offset'] as number);
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot));
    case 'stale-snapshot':
      sys.clock.now += SNAPSHOT_TTL_MS + (p['offset'] as number);
      return runAction(sys, mandate, actionFor(sys, mandate, snapshot));
    case 'checkout-change':
    case 'over-limit-exact': {
      await sys.merchant.inject({
        method: 'POST',
        url: '/merchant/__admin__/price',
        payload: { amount_paise: p['newPrice'] },
      });
      const res = await sys.merchant.inject({ method: 'GET', url: '/merchant/cart' });
      const { CheckoutSnapshotSchema } = await import('../contracts/schemas.js');
      const newSnapshot = CheckoutSnapshotSchema.parse(res.json());
      return runAction(sys, mandate, actionFor(sys, mandate, newSnapshot));
    }
    case 'tampered-mandate': {
      const tampered = { ...mandate, constraints: { ...mandate.constraints, max_amount_paise: p['newCap'] as number } };
      return runAction(sys, tampered, actionFor(sys, mandate, snapshot));
    }
  }
}

export function artifactLine(r: TraceResult): string {
  return JSON.stringify({
    label: 'SYNTHETIC',
    trace_id: r.trace_id,
    seed: r.seed,
    class: r.class,
    verdict: r.observed.verdict,
    reason_codes: r.observed.reason_codes,
    expected: r.expected,
    pass: r.pass,
  });
}

export async function generateAndRun(
  seed: number,
  count: number,
  outPath: string,
  gate?: AnyGate,
): Promise<{ total: number; passed: number; sha256: string }> {
  const traces = generate(seed, count);
  const lines: string[] = [];
  let passed = 0;
  for (const t of traces) {
    const r = await runTrace(t, gate);
    if (r.pass) passed++;
    lines.push(artifactLine(r));
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n') + '\n');
  const sha256 = createHash('sha256').update(readFileSync(outPath, 'utf8')).digest('hex');
  return { total: traces.length, passed, sha256 };
}
