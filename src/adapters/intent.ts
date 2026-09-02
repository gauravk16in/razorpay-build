import { z } from 'zod';
import { ConstraintsDraftSchema } from '../contracts/schemas.js';
import type { IntentProvider, IntentResult } from '../contracts/interfaces.js';
import type { ChatJsonClient } from './llm-client.js';

const ClarifyResponse = z.object({ clarify: z.string().min(1) }).strict();

const SYSTEM_PROMPT = [
  'You extract purchase constraints from a shopping instruction.',
  'Respond with STRICT JSON only, one of:',
  '{"merchant_id": string, "max_amount_paise": integer, "currency": "INR", "item_skus": string[]}',
  '{"clarify": string} — when the instruction is ambiguous or missing merchant, item, or budget.',
  'Rules: max_amount_paise is the user budget in paise (₹2,000 = 200000).',
  'Never invent merchants or items. When unsure, ask via "clarify".',
].join('\n');

// LLM interprets intent; it never authorizes (Constitution §1). All output is
// schema-validated here; anything else becomes a clarification request.
export class LlmIntentProvider implements IntentProvider {
  constructor(private readonly client: ChatJsonClient) {}

  async extract(text: string): Promise<IntentResult> {
    let raw: unknown;
    try {
      raw = await this.client.chatJson([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ]);
    } catch {
      return {
        kind: 'clarify',
        message: 'Intent extraction is unavailable. Please restate merchant, item, and budget.',
      };
    }

    const draft = ConstraintsDraftSchema.safeParse(raw);
    if (draft.success) return { kind: 'constraints', draft: draft.data };

    const clarify = ClarifyResponse.safeParse(raw);
    if (clarify.success) return { kind: 'clarify', message: clarify.data.clarify };

    return {
      kind: 'clarify',
      message: 'Could not understand the purchase intent. Please restate merchant, item, and budget.',
    };
  }
}
