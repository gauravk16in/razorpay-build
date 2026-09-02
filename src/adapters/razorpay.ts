import type { CreateOrderRequest, RazorpayGateway, RzpOrder } from '../contracts/interfaces.js';

// Error taxonomy (T09): executor maps these BY NAME — do not rename casually.
export class RzpAuthError extends Error { override name = 'RzpAuthError'; }
export class RzpDuplicateReceipt extends Error { override name = 'RzpDuplicateReceipt'; }
export class RzpValidationError extends Error { override name = 'RzpValidationError'; }
export class RzpNetworkError extends Error { override name = 'RzpNetworkError'; }
export class RzpUnknownError extends Error { override name = 'RzpUnknownError'; }

interface RawOrder {
  id: string;
  status: string;
  amount: number;
  currency: string;
  receipt: string | null;
  created_at: number;
}

const toOrder = (raw: RawOrder): RzpOrder => ({
  id: raw.id,
  status: raw.status as RzpOrder['status'],
  amount: raw.amount,
  currency: raw.currency,
  receipt: raw.receipt,
  created_at: raw.created_at,
});

// Thin typed wrapper over Razorpay REST (F1–F4). No SDK (PLAN.md D2).
// Credentials are injected; this class never reads env and never logs them.
export class RazorpayAdapter implements RazorpayGateway {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: {
    keyId: string;
    keySecret: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = opts.baseUrl ?? 'https://api.razorpay.com';
    this.authHeader = `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString('base64')}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async createOrder(req: CreateOrderRequest): Promise<RzpOrder> {
    const body: Record<string, unknown> = {
      amount: req.amount_paise,
      currency: req.currency,
      receipt: req.receipt,
      ...(req.notes ? { notes: req.notes } : {}),
    };
    const raw = await this.request('POST', '/v1/orders', body);
    return toOrder(raw as RawOrder);
  }

  async fetchOrder(id: string): Promise<RzpOrder> {
    const raw = await this.request('GET', `/v1/orders/${id}`);
    return toOrder(raw as RawOrder);
  }

  async fetchAllOrders(): Promise<RzpOrder[]> {
    const raw = (await this.request('GET', '/v1/orders')) as { items?: RawOrder[] };
    return (raw.items ?? []).map(toOrder);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: this.authHeader,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new RzpNetworkError(`razorpay request failed: ${(err as Error).message}`);
    }

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON response body */
    }

    if (res.ok) return parsed;

    const description =
      (parsed as { error?: { description?: string } } | null)?.error?.description ?? '';
    if (res.status === 401) throw new RzpAuthError('razorpay authentication failed');
    if (res.status === 400 && /duplicate/i.test(description)) {
      throw new RzpDuplicateReceipt(description);
    }
    if (res.status === 400) throw new RzpValidationError(description || `http 400`);
    throw new RzpUnknownError(`razorpay http ${res.status}: ${description}`);
  }
}
