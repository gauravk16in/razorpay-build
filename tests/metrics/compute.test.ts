import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  computeTraceMetrics,
  computeSuiteSummary,
  computeAll,
  generateClaims,
  type TraceLine,
  type SuiteLine,
} from '../../src/metrics/compute.js';

const tl = (cls: string, verdict: string, pass: boolean): TraceLine => ({
  label: 'SYNTHETIC',
  trace_id: `t_${cls}_${verdict}`,
  seed: 1,
  class: cls,
  verdict,
  reason_codes: ['OK'],
  expected: { verdict: 'ALLOW', reason_codes: ['OK'] },
  pass,
});

describe('metrics: trace computation (golden)', () => {
  const lines: TraceLine[] = [
    tl('valid', 'ALLOW', true),
    tl('valid', 'ALLOW', true),
    tl('valid', 'ALLOW', true),
    tl('valid', 'DENY', false),
    tl('replay', 'DENY', true),
    tl('replay', 'ALLOW', false),
    tl('merchant-substitution', 'DENY', true),
    tl('merchant-substitution', 'ALLOW', false),
    tl('over-limit', 'DENY', true),
    tl('over-limit', 'DENY', true),
  ];

  const m = computeTraceMetrics(lines, 'test-gate');

  it('computes headline rates exactly', () => {
    expect(m.total).toBe(10);
    expect(m.oracleMatchRate).toBeCloseTo(0.7);
    expect(m.validPassRate).toBeCloseTo(0.75);
    expect(m.falseDenialRate).toBeCloseTo(0.25);
    expect(m.unsafeForwardRate).toBeCloseTo(2 / 6);
  });

  it('computes per-class detection rates', () => {
    expect(m.perClassDetection['replay']).toBeCloseTo(0.5);
    expect(m.perClassDetection['merchant-substitution']).toBeCloseTo(0.5);
    expect(m.perClassDetection['over-limit']).toBeCloseTo(1);
  });

  it('evidence completeness = lines with verdict and ≥1 reason code', () => {
    expect(m.evidenceCompleteness).toBe(1);
    const broken = computeTraceMetrics([{ ...tl('valid', 'ALLOW', true), reason_codes: [] }], 'g');
    expect(broken.evidenceCompleteness).toBe(0);
  });
});

describe('metrics: suite computation', () => {
  const lines: SuiteLine[] = [
    { label: 'SYNTHETIC', gate: 'rupeeproof', trace_id: 'valid-purchase', class: 'valid', pass: true, failures: [], observed: { verdict: 'ALLOW', reason_codes: ['OK'], razorpay_calls: 1 } },
    { label: 'SYNTHETIC', gate: 'rupeeproof', trace_id: 'amount-mutation', class: 'amount-mutation', pass: true, failures: [], observed: { verdict: 'DENY', reason_codes: ['AMOUNT_MISMATCH'], razorpay_calls: 0 } },
    { label: 'SYNTHETIC', gate: 'rupeeproof', trace_id: 'duplicate-webhook', class: 'duplicate-webhook', pass: true, failures: [], observed: null },
  ];

  it('summarizes suite pass + webhook dedupe + deny-safety', () => {
    const s = computeSuiteSummary(lines, 'rupeeproof');
    expect(s.total).toBe(3);
    expect(s.passed).toBe(3);
    expect(s.webhookDedupeCorrect).toBe(true);
    expect(s.zeroRazorpayCallsOnDeny).toBe(true);
  });
});

describe('metrics: real artifacts + CLAIMS generation', () => {
  it('computes the frozen headline numbers from committed artifacts', () => {
    const data = computeAll('eval/artifacts');
    const rp = data.traces.find((g) => g.gate === 'rupeeproof');
    const b2 = data.traces.find((g) => g.gate === 'b2-cap-gate');
    expect(rp?.oracleMatchRate).toBe(1);
    expect(rp?.unsafeForwardRate).toBe(0);
    expect(rp?.validPassRate).toBe(1);
    expect(b2?.unsafeForwardRate).toBeGreaterThan(0.8);
  });

  it('includes intent metrics when the T16 artifact exists, tolerates its absence', () => {
    const withIntent = computeAll('eval/artifacts');
    expect(withIntent.intent?.model).toBe('stub-deterministic');
    expect(withIntent.intent?.cases).toBeGreaterThanOrEqual(40);
    const without = computeAll('var/definitely-missing-dir');
    expect(without.intent).toBeUndefined();
    expect(without.traces).toHaveLength(0);
  });

  it('every CLAIMS row references an existing artifact', () => {
    const data = computeAll('eval/artifacts');
    const rows = generateClaims('eval/artifacts', data);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) {
      expect(row.label).toMatch(/REAL_TEST_MODE|REPLAYED|SYNTHETIC|MODELLED/);
      for (const artifact of row.artifacts) {
        expect(existsSync(artifact), `missing artifact for claim: ${row.claim}`).toBe(true);
      }
    }
  });
});
