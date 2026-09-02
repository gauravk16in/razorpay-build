import { describe, it, expect } from 'vitest';
import { LlmIntentProvider } from '../../src/adapters/intent.js';
import { StubIntentProvider } from '../../src/adapters/intent.stub.js';
import type { ChatJsonClient, ChatMessage } from '../../src/adapters/llm-client.js';

const HERO = 'Buy these headphones from SonicStore for no more than ₹2,000.';

describe('intent stub: deterministic baseline', () => {
  it('maps the hero intent to the SonicStore constraints, byte-identically', async () => {
    const stub = new StubIntentProvider();
    const a = await stub.extract(HERO);
    const b = await stub.extract(HERO);
    expect(a).toEqual(b);
    expect(a).toEqual({
      kind: 'constraints',
      draft: {
        merchant_id: 'sonicstore',
        max_amount_paise: 200_000,
        currency: 'INR',
        item_skus: ['hp-001'],
      },
    });
  });

  it('unknown intent → clarify, never throws', async () => {
    const res = await new StubIntentProvider().extract('flibbertigibbet');
    expect(res.kind).toBe('clarify');
  });
});

describe('llm intent provider: untrusted output handling', () => {
  const fakeClient = (impl: (messages: ChatMessage[]) => Promise<unknown>): ChatJsonClient => ({
    chatJson: impl,
  });

  it('valid JSON constraints → constraints draft', async () => {
    const provider = new LlmIntentProvider(
      fakeClient(async () => ({
        merchant_id: 'sonicstore',
        max_amount_paise: 200_000,
        currency: 'INR',
        item_skus: ['hp-001'],
      })),
    );
    const res = await provider.extract(HERO);
    expect(res.kind).toBe('constraints');
  });

  it('garbage non-JSON-shaped output → clarify, never throws', async () => {
    const provider = new LlmIntentProvider(fakeClient(async () => 'hello there'));
    const res = await provider.extract(HERO);
    expect(res.kind).toBe('clarify');
  });

  it('schema-invalid constraints (negative amount) → clarify', async () => {
    const provider = new LlmIntentProvider(
      fakeClient(async () => ({
        merchant_id: 'sonicstore',
        max_amount_paise: -5,
        currency: 'INR',
        item_skus: ['hp-001'],
      })),
    );
    const res = await provider.extract(HERO);
    expect(res.kind).toBe('clarify');
  });

  it('LLM clarify response → clarify passthrough', async () => {
    const provider = new LlmIntentProvider(
      fakeClient(async () => ({ clarify: 'Which merchant did you mean?' })),
    );
    const res = await provider.extract('buy the thing from the place');
    expect(res).toEqual({ kind: 'clarify', message: 'Which merchant did you mean?' });
  });

  it('client failure (network/parse) → clarify, never throws into core', async () => {
    const provider = new LlmIntentProvider(
      fakeClient(async () => {
        throw new Error('connection refused');
      }),
    );
    const res = await provider.extract(HERO);
    expect(res.kind).toBe('clarify');
  });
});
