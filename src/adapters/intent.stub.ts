import type { IntentProvider, IntentResult } from '../contracts/interfaces.js';
import type { ConstraintsDraft } from '../contracts/schemas.js';

// Deterministic, offline intent provider: the default for tests, harness, and
// demo fallback (PLAN.md D5-adjacent; cut order keeps the demo working without
// a live LLM). Phrase table is intentionally tiny and explicit.
const TABLE: Array<{ match: string; draft: ConstraintsDraft }> = [
  {
    match: 'headphones from sonicstore for no more than ₹2,000',
    draft: { merchant_id: 'sonicstore', max_amount_paise: 200_000, currency: 'INR', item_skus: ['hp-001'] },
  },
  {
    match: 'headphones from sonicstore under ₹2,000',
    draft: { merchant_id: 'sonicstore', max_amount_paise: 200_000, currency: 'INR', item_skus: ['hp-001'] },
  },
  {
    match: 'headphones from sonicstore for no more than ₹1,500',
    draft: { merchant_id: 'sonicstore', max_amount_paise: 150_000, currency: 'INR', item_skus: ['hp-001'] },
  },
];

export class StubIntentProvider implements IntentProvider {
  async extract(text: string): Promise<IntentResult> {
    const norm = text.trim().toLowerCase();
    const hit = TABLE.find((row) => norm.includes(row.match));
    if (hit) return { kind: 'constraints', draft: hit.draft };
    return {
      kind: 'clarify',
      message: 'Stub provider only knows the scripted demo intents. Please use a known phrase.',
    };
  }
}
