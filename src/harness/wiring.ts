import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import { JsonlLedger } from '../core/ledger.js';
import { MandateService } from '../core/mandate.js';
import { Verifier } from '../core/verifier.js';
import { Executor } from '../core/executor.js';
import { buildMerchantApp } from '../merchant/server.js';
import { buildWebhookApp } from '../webhooks/endpoint.js';
import { FakeRazorpay } from '../adapters/razorpay.fake.js';
import type { SnapshotFetchResult } from '../contracts/interfaces.js';
import { constraintsFixture } from '../contracts/fixtures.js';
import {
  CheckoutSnapshotSchema,
  type CheckoutSnapshot,
  type Decision,
  type Mandate,
  type ProposedAction,
} from '../contracts/schemas.js';

export const HMAC_KEY = 'harness-mandate-key';
export const WEBHOOK_SECRET = 'harness-webhook-secret';
export const T0 = 1_757_000_000_000;

export class SpyRazorpay extends FakeRazorpay {
  createOrderCalls = 0;
  override async createOrder(req: Parameters<FakeRazorpay['createOrder']>[0]) {
    this.createOrderCalls++;
    return super.createOrder(req);
  }
}

export interface WiredSystem {
  dir: string;
  clock: { now: number };
  merchantClock: { now: number };
  ledger: JsonlLedger;
  mandates: MandateService;
  verifier: Verifier;
  executor: Executor;
  merchant: FastifyInstance;
  webhooks: FastifyInstance;
  gateway: SpyRazorpay;
}

// Assembly only — no production behavior lives here (T13A card).
export function buildSystem(): WiredSystem {
  const dir = mkdtempSync(join(tmpdir(), 'rp-harness-'));
  const clock = { now: T0 };
  const merchantClock = { now: T0 };
  const ledger = new JsonlLedger(join(dir, 'ledger.jsonl'), () => clock.now);
  const mandates = new MandateService(ledger, HMAC_KEY, () => clock.now);
  const verifier = new Verifier(HMAC_KEY);
  const executor = new Executor(ledger, () => clock.now);
  const merchant = buildMerchantApp({ clock: () => merchantClock.now });
  const webhooks = buildWebhookApp({ ledger, secret: WEBHOOK_SECRET, clock: () => clock.now });
  const gateway = new SpyRazorpay({ clock: () => clock.now });
  return { dir, clock, merchantClock, ledger, mandates, verifier, executor, merchant, webhooks, gateway };
}

// Snapshot fetcher (PLAN.md §06 #4): fetches ONLY from the mandate-bound
// merchant URL (SEC6) — never from action-supplied data. Harness uses HTTP
// inject for socket-less HTTP semantics.
export async function fetchSnapshot(sys: WiredSystem, mandate: Mandate): Promise<SnapshotFetchResult> {
  try {
    const path = new URL(mandate.constraints.merchant_base_url).pathname.replace(/\/$/, '') + '/cart';
    const res = await sys.merchant.inject({ method: 'GET', url: path });
    if (res.statusCode !== 200) return { ok: false, error: 'UNREACHABLE' };
    const parsed = CheckoutSnapshotSchema.safeParse(res.json());
    if (!parsed.success) return { ok: false, error: 'INVALID_SCHEMA' };
    return { ok: true, snapshot: parsed.data };
  } catch {
    return { ok: false, error: 'UNREACHABLE' };
  }
}

// Full pipeline: fetch → verify → record decision → (ALLOW ⇒ token+execute).
// This is the only place latency is measured onto the decision (T07 note).
export async function runAction(
  sys: WiredSystem,
  mandate: Mandate,
  action: ProposedAction,
): Promise<Decision> {
  const fetched = await fetchSnapshot(sys, mandate);
  const t0 = performance.now();
  const raw = sys.verifier.decide({ mandate, action, fetched, now: sys.clock.now });
  const decision: Decision = { ...raw, latency_ms: performance.now() - t0 };
  await sys.ledger.append('decision.recorded', decision);
  if (decision.verdict === 'ALLOW') {
    const token = await sys.executor.issueToken(decision);
    const record = await sys.executor.execute({ decision, token, gateway: sys.gateway, action });
    // I3: a created order consumes the mandate. FAILED/UNKNOWN leaves it
    // ACTIVE (reconciliation path, PLAN.md §07).
    if (record.status === 'CREATED') await sys.mandates.consume(mandate.mandate_id);
  }
  return decision;
}

// Scenario helpers -----------------------------------------------------------

export async function issueForCurrentCart(
  sys: WiredSystem,
): Promise<{ mandate: Mandate; snapshot: CheckoutSnapshot }> {
  const res = await sys.merchant.inject({ method: 'GET', url: '/merchant/cart' });
  const snapshot = CheckoutSnapshotSchema.parse(res.json());
  const mandate = await sys.mandates.issueMandate(constraintsFixture, snapshot);
  return { mandate, snapshot };
}

export function actionFor(
  sys: WiredSystem,
  mandate: Mandate,
  snapshot: CheckoutSnapshot,
  overrides: Partial<ProposedAction> = {},
): ProposedAction {
  return {
    action_id: `act_${randomUUID()}`,
    mandate_id: mandate.mandate_id,
    merchant_id: snapshot.merchant_id,
    amount_paise: snapshot.amount_paise,
    currency: snapshot.currency,
    items: snapshot.items,
    proposed_at: sys.clock.now,
    ...overrides,
  };
}
