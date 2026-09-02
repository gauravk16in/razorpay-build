import type {
  CheckoutSnapshot,
  ConstraintsDraft,
  Decision,
  ExecutionRecord,
  ExecutionToken,
  LedgerEntry,
  Mandate,
  ProposedAction,
  WebhookEventRecord,
} from './schemas.js';

// Verifier boundary (PLAN.md §06): snapshot fetch result is an input, the
// verifier itself never performs I/O.
export type SnapshotFetchResult =
  | { ok: true; snapshot: CheckoutSnapshot }
  | { ok: false; error: 'UNREACHABLE' | 'INVALID_SCHEMA' | 'TIMEOUT' };

export interface VerifierInput {
  mandate: Mandate;
  action: ProposedAction;
  fetched: SnapshotFetchResult;
  now: number;
}

// Implemented by the verifier and by baselines B1/B2 (drop-in comparable).
export interface Gate {
  decide(input: VerifierInput): Decision;
}

// Razorpay adapter boundary (PLAN.md F1–F4). created_at is Razorpay's Unix
// seconds; amounts are paise.
export interface CreateOrderRequest {
  amount_paise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RzpOrder {
  id: string;
  status: 'created' | 'attempted' | 'paid';
  amount: number;
  currency: string;
  receipt: string | null;
  created_at: number;
}

export interface RazorpayGateway {
  createOrder(req: CreateOrderRequest): Promise<RzpOrder>;
  fetchOrder(id: string): Promise<RzpOrder>;
  fetchAllOrders(): Promise<RzpOrder[]>;
}

// LLM boundary: untrusted draft or clarification; never authority (§1).
export type IntentResult =
  | { kind: 'constraints'; draft: ConstraintsDraft }
  | { kind: 'clarify'; message: string };

export interface IntentProvider {
  extract(text: string): Promise<IntentResult>;
}

export interface LedgerState {
  mandates: Map<string, Mandate>;
  decisions: Map<string, Decision>;
  tokens: Map<string, ExecutionToken>;
  executions: Map<string, ExecutionRecord>;
  webhookEvents: Map<string, WebhookEventRecord>;
}

export interface Ledger {
  append(type: string, payload: unknown): Promise<LedgerEntry>;
  replay(): LedgerState;
  verifyChain(): boolean;
}
