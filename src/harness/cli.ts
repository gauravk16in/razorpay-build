import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCENARIOS } from './scenarios.js';
import { runAll, type HarnessResult } from './runner.js';
import { generateAndRun } from './generator.js';
import { CapGate } from '../baselines/cap-gate.js';
import { LlmJudgeGate } from '../baselines/llm-judge.js';
import { LlmClient } from '../adapters/llm-client.js';
import type { AnyGate } from './wiring.js';

// npm run harness — modes:
//   (no flags)                    scenario suite vs RupeeProof gate
//   --gate=b2|b1                  suite vs a baseline gate
//   --seed=N --count=N --out=F    seeded trace generation (any --gate)
function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) flags[a.slice(2)] = '1';
    else flags[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return flags;
}

function loadEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function resolveGate(name: string | undefined): Promise<{ gate?: AnyGate; label: string }> {
  if (!name || name === 'rupeeproof') return { label: 'rupeeproof' };
  if (name === 'b2') return { gate: new CapGate(), label: 'b2-cap-gate' };
  if (name === 'b1') {
    loadEnv();
    const { OPENAI_BASE_URL, OPENAI_API_KEY, LLM_MODEL } = process.env;
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY || !LLM_MODEL) {
      console.error('gate=b1 requires OPENAI_BASE_URL, OPENAI_API_KEY, LLM_MODEL in .env');
      process.exit(2);
    }
    return {
      gate: new LlmJudgeGate(new LlmClient({ baseUrl: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY, model: LLM_MODEL }), LLM_MODEL),
      label: `b1-llm-judge-${LLM_MODEL}`,
    };
  }
  console.error(`unknown gate: ${name}`);
  process.exit(2);
}

const resultLine = (gateLabel: string, r: HarnessResult): string =>
  JSON.stringify({
    label: gateLabel === 'rupeeproof' ? 'SYNTHETIC' : 'MODELLED',
    gate: gateLabel,
    trace_id: r.id,
    class: r.class,
    pass: r.pass,
    failures: r.failures,
    observed: r.observation
      ? {
          verdict: r.observation.decisions.at(-1)?.verdict ?? null,
          reason_codes: r.observation.decisions.at(-1)?.reason_codes ?? [],
          razorpay_calls: r.observation.razorpayCalls,
        }
      : null,
  });

const flags = parseFlags(process.argv.slice(2));
const { gate, label } = await resolveGate(flags['gate']);

if (flags['seed'] !== undefined || flags['count'] !== undefined) {
  const seed = Number(flags['seed'] ?? '42');
  const count = Number(flags['count'] ?? '1000');
  const out = flags['out'] ?? `eval/artifacts/traces-${label}-s${seed}.jsonl`;
  const r = await generateAndRun(seed, count, out, gate);
  console.log(`gate=${label} traces: ${r.passed}/${r.total} match oracle; artifact=${out}`);
  console.log(`sha256=${r.sha256}`);
  // Baseline traces are EVIDENCE, not failures: exit 1 only for the system under test.
  process.exit(label === 'rupeeproof' && r.passed !== r.total ? 1 : 0);
}

const results = await runAll(SCENARIOS, gate);
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${r.class.padEnd(24)} ${r.id}`);
  for (const f of r.failures) console.log(`      └─ ${f}`);
}
const passed = results.filter((r) => r.pass).length;
console.log(`\ngate=${label}: ${passed}/${results.length} scenario classes pass`);

if (flags['out']) {
  mkdirSync(dirname(flags['out']), { recursive: true });
  writeFileSync(flags['out'], results.map((r) => resultLine(label, r)).join('\n') + '\n');
  console.log(`artifact=${flags['out']}`);
}

process.exit(label === 'rupeeproof' && passed !== results.length ? 1 : 0);
