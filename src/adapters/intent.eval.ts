import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { ConstraintsDraftSchema, type ConstraintsDraft } from '../contracts/schemas.js';
import { canonicalJson } from '../core/crypto.js';
import type { IntentProvider } from '../contracts/interfaces.js';
import { StubIntentProvider } from './intent.stub.js';
import { LlmIntentProvider } from './intent.js';
import { LlmClient } from './llm-client.js';

// Intent extraction evaluation (T16): generation ONLY — reporting is T15.
export interface CorpusEntry {
  id: string;
  utterance: string;
  ambiguity: 'clear' | 'ambiguous';
  gold: ConstraintsDraft | null;
}

const CorpusFileSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string().min(1),
      utterance: z.string().min(1),
      ambiguity: z.enum(['clear', 'ambiguous']),
      gold: ConstraintsDraftSchema.nullable(),
    }),
  ),
});

export function loadCorpus(dir: string): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))) {
    const parsed = CorpusFileSchema.parse(YAML.parse(readFileSync(join(dir, file), 'utf8')));
    entries.push(...parsed.entries);
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

// "Unsafe under-constraint" = predicted constraints are strictly LOOSER than
// gold (higher cap, or a strict superset of items). Tighter-but-wrong is a
// different failure and does not count here (unit-tested).
export function unsafeUnderConstraint(predicted: ConstraintsDraft, gold: ConstraintsDraft): boolean {
  if (predicted.max_amount_paise > gold.max_amount_paise) return true;
  const goldSet = new Set(gold.item_skus);
  const predSet = new Set(predicted.item_skus);
  const isStrictSuperset = predSet.size > goldSet.size && [...goldSet].every((s) => predSet.has(s));
  return isStrictSuperset;
}

export interface IntentCaseResult {
  id: string;
  ambiguity: 'clear' | 'ambiguous';
  result_kind: 'constraints' | 'clarify';
  exact_match: boolean;
  unsafe_under_constraint: boolean;
  clarify_correct: boolean;
}

export interface IntentEvalResult {
  label: 'SYNTHETIC';
  model: string;
  cases: IntentCaseResult[];
}

export async function runEval(
  provider: IntentProvider,
  entries: CorpusEntry[],
  model: string,
): Promise<IntentEvalResult> {
  const cases: IntentCaseResult[] = [];
  for (const e of entries) {
    const res = await provider.extract(e.utterance);
    const predicted = res.kind === 'constraints' ? res.draft : null;
    cases.push({
      id: e.id,
      ambiguity: e.ambiguity,
      result_kind: res.kind,
      exact_match:
        predicted !== null && e.gold !== null && canonicalJson(predicted) === canonicalJson(e.gold),
      unsafe_under_constraint: predicted !== null && e.gold !== null && unsafeUnderConstraint(predicted, e.gold),
      clarify_correct: res.kind === 'clarify' && e.gold === null,
    });
  }
  return { label: 'SYNTHETIC', model, cases };
}

// CLI entry (npm run eval:intent) --------------------------------------------
function loadEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  loadEnv();
  const live =
    process.env['LLM_LIVE'] === '1' &&
    Boolean(process.env['OPENAI_BASE_URL']) &&
    Boolean(process.env['OPENAI_API_KEY']) &&
    Boolean(process.env['LLM_MODEL']);
  const provider: IntentProvider = live
    ? new LlmIntentProvider(
        new LlmClient({
          baseUrl: process.env['OPENAI_BASE_URL']!,
          apiKey: process.env['OPENAI_API_KEY']!,
          model: process.env['LLM_MODEL']!,
        }),
      )
    : new StubIntentProvider();
  const model = live ? process.env['LLM_MODEL']! : 'stub-deterministic';

  const entries = loadCorpus('eval/corpus');
  const result = await runEval(provider, entries, model);
  const out = 'eval/artifacts/intent-results.json';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  const exact = result.cases.filter((c) => c.exact_match).length;
  const unsafe = result.cases.filter((c) => c.unsafe_under_constraint).length;
  const clarify = result.cases.filter((c) => c.clarify_correct).length;
  console.log(
    `intent eval (${model}): ${exact} exact / ${result.cases.length} cases, ${unsafe} unsafe-under-constraint, ${clarify} correct clarifies → ${out}`,
  );
}
