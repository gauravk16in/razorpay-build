import { z } from 'zod';
import { REASON_CODES } from './reason-codes.js';

// Shared primitives (PLAN.md §05: amounts integer paise, epoch ms, sha256 hex).
export const Hash256 = z.string().regex(/^[0-9a-f]{64}$/);
export const Paise = z.number().int().positive();
export const EpochMs = z.number().int().nonnegative();
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const CartItemSchema = z
  .object({
    sku: z.string().min(1),
    name: z.string().min(1),
    qty: z.number().int().positive(),
    unit_price: Paise,
  })
  .strict();

export const CheckoutSnapshotSchema = z
  .object({
    merchant_id: z.string().min(1),
    items: z.array(CartItemSchema).min(1),
    amount_paise: Paise,
    currency: CurrencyCode,
    fetched_at: EpochMs,
  })
  .strict();

export const ConstraintsSchema = z
  .object({
    merchant_id: z.string().min(1),
    merchant_base_url: z.string().regex(/^https?:\/\/.+/),
    max_amount_paise: Paise,
    currency: CurrencyCode,
  })
  .strict();

export const MandateStatusSchema = z.enum(['ACTIVE', 'CONSUMED', 'EXPIRED', 'SUPERSEDED']);

export const MandateSchema = z
  .object({
    mandate_id: z.string().min(1),
    constraints: ConstraintsSchema,
    approved_snapshot_hash: Hash256,
    issued_at: EpochMs,
    expires_at: EpochMs,
    nonce: z.string().min(1),
    status: MandateStatusSchema,
    signature: Hash256,
    superseded_by: z.string().optional(),
  })
  .strict();

export const ProposedActionSchema = z
  .object({
    action_id: z.string().min(1),
    mandate_id: z.string().min(1),
    merchant_id: z.string().min(1),
    amount_paise: Paise,
    currency: CurrencyCode,
    items: z.array(CartItemSchema).min(1),
    proposed_at: EpochMs,
  })
  .strict();

export const VerdictSchema = z.enum(['ALLOW', 'DENY']);
export const NextActionSchema = z.enum(['REQUIRE_REAPPROVAL']);

export const DecisionSchema = z
  .object({
    decision_id: z.string().min(1),
    mandate_id: z.string().min(1),
    action_hash: Hash256,
    verdict: VerdictSchema,
    reason_codes: z.array(z.enum(REASON_CODES)).min(1),
    approved_snapshot_hash: Hash256,
    fetched_snapshot_hash: Hash256,
    decided_at: EpochMs,
    latency_ms: z.number().nonnegative(),
    next_action: NextActionSchema.optional(),
  })
  .strict();

export const ExecutionTokenSchema = z
  .object({
    token_id: z.string().min(1),
    decision_id: z.string().min(1),
    expires_at: EpochMs,
    used: z.boolean(),
  })
  .strict();

export const ExecutionStatusSchema = z.enum(['CREATED', 'FAILED', 'UNKNOWN']);

export const ExecutionRecordSchema = z
  .object({
    execution_id: z.string().min(1),
    decision_id: z.string().min(1),
    receipt: z.string().min(1).max(40),
    razorpay_order_id: z.string().optional(),
    request_hash: Hash256,
    response: z.unknown().optional(),
    status: ExecutionStatusSchema,
    executed_at: EpochMs,
  })
  .strict();

export const WebhookProcessedSchema = z.enum(['PROCESSED', 'DUPLICATE', 'REJECTED']);

export const WebhookEventRecordSchema = z
  .object({
    event_id: z.string().min(1),
    event_type: z.string().min(1),
    signature_valid: z.boolean(),
    processed: WebhookProcessedSchema,
    linked_order_id: z.string().optional(),
    raw_hash: Hash256,
    received_at: EpochMs,
  })
  .strict();

export const LedgerEntrySchema = z
  .object({
    seq: z.number().int().nonnegative(),
    type: z.string().min(1),
    payload: z.unknown(),
    prev_hash: Hash256,
    entry_hash: Hash256,
    at: EpochMs,
  })
  .strict();

export const ConstraintsDraftSchema = z
  .object({
    merchant_id: z.string().min(1),
    max_amount_paise: Paise,
    currency: CurrencyCode,
    item_skus: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type CartItem = z.infer<typeof CartItemSchema>;
export type CheckoutSnapshot = z.infer<typeof CheckoutSnapshotSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type MandateStatus = z.infer<typeof MandateStatusSchema>;
export type Mandate = z.infer<typeof MandateSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type NextAction = z.infer<typeof NextActionSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ExecutionToken = z.infer<typeof ExecutionTokenSchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;
export type WebhookProcessed = z.infer<typeof WebhookProcessedSchema>;
export type WebhookEventRecord = z.infer<typeof WebhookEventRecordSchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type ConstraintsDraft = z.infer<typeof ConstraintsDraftSchema>;
