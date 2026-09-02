// Minimal OpenAI-compatible chat client. The LLM is UNTRUSTED input
// (Constitution §1): this client returns parsed JSON for the caller to
// schema-validate; it never decides anything.
export class LlmError extends Error {}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatJsonClient {
  chatJson(messages: ChatMessage[]): Promise<unknown>;
}

export class LlmClient implements ChatJsonClient {
  constructor(
    private readonly opts: { baseUrl: string; apiKey: string; model: string },
  ) {}

  async chatJson(messages: ChatMessage[]): Promise<unknown> {
    const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new LlmError(`llm http ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError('llm response missing content');
    try {
      return JSON.parse(content);
    } catch {
      throw new LlmError('llm content was not valid JSON');
    }
  }
}
