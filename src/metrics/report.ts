import { writeFileSync } from 'node:fs';
import { computeAll, generateClaims, type ClaimRow, type EvalData } from './compute.js';

// npm run eval — regenerates eval/report.md and CLAIMS.md from committed
// artifacts. Reporting only; numbers are computed in compute.ts (T15 rule).
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function renderReport(data: EvalData): string {
  const lines: string[] = [
    '# RupeeProof — Evaluation Report',
    '',
    'Regenerate with `npm run eval`. Every number below is computed from committed',
    'artifacts in `eval/artifacts/` by `src/metrics/compute.ts` (single writer).',
    '',
    '## Headline: transaction integrity vs baselines',
    '',
    '| Gate | Traces | Oracle match | Unsafe-forward | Valid pass | False deny | Evidence completeness |',
    '|------|--------|--------------|----------------|------------|------------|-----------------------|',
  ];
  for (const g of data.traces) {
    lines.push(
      `| ${g.gate} | ${g.total} | ${pct(g.oracleMatchRate)} | ${pct(g.unsafeForwardRate)} | ${pct(g.validPassRate)} | ${pct(g.falseDenialRate)} | ${pct(g.evidenceCompleteness)} |`,
    );
  }

  lines.push('', '## Per-class detection rate (attack classes, deny = detected)', '');
  const classes = [...new Set(data.traces.flatMap((g) => Object.keys(g.perClassDetection)))].sort();
  lines.push(`| Class | ${data.traces.map((g) => g.gate).join(' | ')} |`);
  lines.push(`|-------|${data.traces.map(() => '------').join('|')}|`);
  for (const c of classes) {
    lines.push(`| ${c} | ${data.traces.map((g) => pct(g.perClassDetection[c] ?? 0)).join(' | ')} |`);
  }

  lines.push('', '## Adversarial scenario suite (end-to-end pipeline)', '');
  lines.push('| Gate | Classes passed | Zero Razorpay calls on deny | Webhook dedupe |');
  lines.push('|------|----------------|-----------------------------|----------------|');
  for (const s of data.suites) {
    lines.push(
      `| ${s.gate} | ${s.passed}/${s.total} | ${s.zeroRazorpayCallsOnDeny ? 'yes' : 'NO'} | ${s.webhookDedupeCorrect === null ? 'n/a' : s.webhookDedupeCorrect ? 'correct' : 'BROKEN'} |`,
    );
  }

  lines.push(
    '',
    '## Latency',
    '',
    'Verifier p99 < 5 ms over 10,000 pure in-process decisions (bench-asserted).',
    'Reproduce: `npm test tests/core/verifier` (prints p50/p99).',
  );

  if (data.intent) {
    lines.push(
      '',
      '## Intent extraction',
      '',
      `Model: ${data.intent.model} — accuracy ${pct(data.intent.accuracy)} over ${data.intent.cases} labeled`,
      `utterances; unsafe-under-constraint rate ${pct(data.intent.unsafeUnderConstraintRate)}.`,
      'Corpus is small and English-only (SYNTHETIC).',
    );
  }

  lines.push(
    '',
    '## Labels & limitations',
    '',
    '- All trace/suite numbers are **SYNTHETIC**: seeded generator, fixture merchant, in-memory gateway.',
    '- REAL_TEST_MODE rows appear in CLAIMS.md only when backed by a live Razorpay Test Mode artifact.',
    '- The merchant is a fixture; payment completion is out of scope (execution boundary = order creation).',
    '- B1 (LLM-as-judge) numbers are added when LLM credentials are available (gate=b1).',
  );
  return lines.join('\n') + '\n';
}

export function renderClaims(rows: ClaimRow[]): string {
  const lines = [
    '# RupeeProof — CLAIMS',
    '',
    'Every externally-facing claim, mapped to its reproducible evidence (Constitution §7).',
    'Labels per Constitution §8: REAL_TEST_MODE | REPLAYED | SYNTHETIC | MODELLED.',
    '',
    '| # | Claim | Metric | Value | Label | Evidence artifacts | Reproduce |',
    '|---|-------|--------|-------|-------|--------------------|-----------|',
  ];
  rows.forEach((r, i) => {
    const artifacts = r.artifacts.map((a) => `\`${a}\``).join('<br>');
    lines.push(
      `| ${i + 1} | ${r.claim} | ${r.metric} | ${r.value} | ${r.label} | ${artifacts} | \`${r.reproduce}\` |`,
    );
  });
  return lines.join('\n') + '\n';
}

const data = computeAll('eval/artifacts');
const rows = generateClaims('eval/artifacts', data);
writeFileSync('eval/report.md', renderReport(data));
writeFileSync('CLAIMS.md', renderClaims(rows));
console.log(`eval/report.md written (${data.traces.length} gates, ${data.suites.length} suites)`);
console.log(`CLAIMS.md written (${rows.length} claims)`);
