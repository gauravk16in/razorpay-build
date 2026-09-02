import type {
  CheckoutSnapshot,
  Constraints,
  ConstraintsDraft,
  Decision,
  ExecutionRecord,
  ExecutionToken,
  LedgerEntry,
  Mandate,
  ProposedAction,
  WebhookEventRecord,
} from './schemas.js';
import type { RzpOrder } from './interfaces.js';

// Deterministic fixtures for contract + downstream tests. Hashes are
// shape-valid placeholders (64 lowercase hex), not real digests.
const H = (c: string): string => c.repeat(64);

export const snapshotFixture: CheckoutSnapshot = {
  merchant_id: 'sonicstore',
  items: [{ sku: 'hp-001', name: 'SonicPods Headphones', qty: 1, unit_price: 199_900 }],
  amount_paise: 199_900,
  currency: 'INR',
  fetched_at: 1_757_000_000_000,
};

export const constraintsFixture: Constraints = {
  merchant_id: 'sonicstore',
  merchant_base_url: 'http://localhost:4010/merchant',
  max_amount_paise: 200_000,
  currency: 'INR',
};

export const constraintsDraftFixture: ConstraintsDraft = {
  merchant_id: 'sonicstore',
  max_amount_paise: 200_000,
  currency: 'INR',
  item_skus: ['hp-001'],
};

export const mandateFixture: Mandate = {
  mandate_id: 'mnd_0001',
  constraints: constraintsFixture,
  approved_snapshot_hash: H('a'),
  issued_at: 1_757_000_000_000,
  expires_at: 1_757_000_600_000,
  nonce: 'nonce-0001',
  status: 'ACTIVE',
  signature: H('c'),
};

export const actionFixture: ProposedAction = {
  action_id: 'act_0001',
  mandate_id: 'mnd_0001',
  merchant_id: 'sonicstore',
  amount_paise: 199_900,
  currency: 'INR',
  items: snapshotFixture.items,
  proposed_at: 1_757_000_010_000,
};

export const decisionFixture: Decision = {
  decision_id: 'dec_0001',
  mandate_id: 'mnd_0001',
  action_hash: H('d'),
  verdict: 'ALLOW',
  reason_codes: ['OK'],
  approved_snapshot_hash: H('a'),
  fetched_snapshot_hash: H('a'),
  decided_at: 1_757_000_020_000,
  latency_ms: 1,
};

export const tokenFixture: ExecutionToken = {
  token_id: 'tok_0001',
  decision_id: 'dec_0001',
  expires_at: 1_757_000_030_000,
  used: false,
};

export const executionFixture: ExecutionRecord = {
  execution_id: 'exe_0001',
  decision_id: 'dec_0001',
  receipt: 'rp-dec_0001',
  razorpay_order_id: 'order_TEST123',
  request_hash: H('e'),
  status: 'CREATED',
  executed_at: 1_757_000_040_000,
};

export const webhookFixture: WebhookEventRecord = {
  event_id: 'evt_0001',
  event_type: 'payment.captured',
  signature_valid: true,
  processed: 'PROCESSED',
  linked_order_id: 'order_TEST123',
  raw_hash: H('f'),
  received_at: 1_757_000_050_000,
};

export const ledgerEntryFixture: LedgerEntry = {
  seq: 0,
  type: 'genesis',
  payload: {},
  prev_hash: H('0'),
  entry_hash: H('1'),
  at: 1_756_999_000_000,
};

export const rzpOrderFixture: RzpOrder = {
  id: 'order_TEST123',
  status: 'created',
  amount: 199_900,
  currency: 'INR',
  receipt: 'rp-dec_0001',
  created_at: 1_757_000_040,
};
