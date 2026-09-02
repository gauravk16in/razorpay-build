import { randomUUID } from 'node:crypto';
import { actionHash, canonicalHash, snapshotHash, verifyPayload } from './crypto.js';
import { mandateSigningCore } from './mandate.js';
import { MandateSchema, ProposedActionSchema, type Decision, type Mandate } from '../contracts/schemas.js';
import type { ReasonCode } from '../contracts/reason-codes.js';
import type { Gate, VerifierInput } from '../contracts/interfaces.js';

export const SNAPSHOT_TTL_MS = 60_000;
const ZERO_HASH = '0'.repeat(64);

// The deterministic authorization core (PLAN.md §06, Constitution §1/§2).
// Pure: no I/O, no clocks beyond the injected `now`, no adapter imports.
// Fail closed: malformed input or internal error ⇒ DENY, never throw.
export class Verifier implements Gate {
  constructor(private readonly hmacKey: string) {}

  decide(input: VerifierInput): Decision {
    try {
      return this.decideInner(input);
    } catch {
      return this.errorDecision(input);
    }
  }

  private decideInner(input: VerifierInput): Decision {
    const { action, fetched, now } = input;
    const mandateParsed = MandateSchema.safeParse(input.mandate);
    const actionParsed = ProposedActionSchema.safeParse(action);
    if (!mandateParsed.success || !actionParsed.success) return this.errorDecision(input);
    const mandate = mandateParsed.data;

    const actHash = actionHash(mandateParsed.success ? actionParsed.data : (action as never));
    const fetchedHash = fetched.ok ? snapshotHash(fetched.snapshot) : ZERO_HASH;

    const finish = (verdict: 'ALLOW' | 'DENY', codes: ReasonCode[]): Decision => ({
      decision_id: `dec_${randomUUID()}`,
      mandate_id: mandate.mandate_id,
      action_hash: actHash,
      verdict,
      reason_codes: codes,
      approved_snapshot_hash: mandate.approved_snapshot_hash,
      fetched_snapshot_hash: fetchedHash,
      decided_at: now,
      latency_ms: 0, // measured and recorded by the caller (task card)
      ...(codes.includes('CHECKOUT_CHANGED') ? { next_action: 'REQUIRE_REAPPROVAL' as const } : {}),
    });

    // I13: integrity first — an unverifiable mandate is deny, nothing else matters.
    if (!verifyPayload(mandateSigningCore(mandate), mandate.signature, this.hmacKey)) {
      return finish('DENY', ['MANDATE_INVALID']);
    }

    const codes: ReasonCode[] = [];

    // Lifecycle (I3, I4). SUPERSEDED re-use = replay of a replaced mandate.
    if (mandate.status === 'CONSUMED') codes.push('MANDATE_CONSUMED');
    if (mandate.status === 'SUPERSEDED') codes.push('REPLAY_DETECTED');
    if (mandate.status === 'EXPIRED' || now > mandate.expires_at) codes.push('MANDATE_EXPIRED');

    if (!fetched.ok) {
      codes.push('SNAPSHOT_UNAVAILABLE');
      return finish('DENY', dedupe(codes));
    }

    const snap = fetched.snapshot;
    // Snapshot health
    if (snap.fetched_at > now) codes.push('SNAPSHOT_FROM_FUTURE');
    else if (now - snap.fetched_at > SNAPSHOT_TTL_MS) codes.push('STALE_SNAPSHOT');

    // I12: fetched state must come from the mandate-bound merchant.
    if (snap.merchant_id !== mandate.constraints.merchant_id) {
      codes.push('MERCHANT_BINDING_VIOLATION');
    }

    // I2: action vs mandate + action vs live checkout.
    if (action.merchant_id !== mandate.constraints.merchant_id) codes.push('MERCHANT_MISMATCH');
    if (action.currency !== mandate.constraints.currency) codes.push('CURRENCY_MISMATCH');
    if (action.amount_paise !== snap.amount_paise) codes.push('AMOUNT_MISMATCH');
    if (action.amount_paise > mandate.constraints.max_amount_paise) codes.push('OVER_LIMIT');
    if (canonicalHash(action.items) !== canonicalHash(snap.items)) codes.push('ITEMS_MISMATCH');

    // I5: exact checkout-state binding.
    if (snapshotHash(snap) !== mandate.approved_snapshot_hash) codes.push('CHECKOUT_CHANGED');

    return codes.length === 0 ? finish('ALLOW', ['OK']) : finish('DENY', dedupe(codes));
  }

  private errorDecision(input: VerifierInput): Decision {
    let actHash = ZERO_HASH;
    let mandateId = 'unknown';
    let approved = ZERO_HASH;
    try {
      actHash = canonicalHash(input.action);
    } catch {
      /* keep sentinel */
    }
    try {
      mandateId = (input.mandate as Mandate).mandate_id ?? 'unknown';
      approved = (input.mandate as Mandate).approved_snapshot_hash ?? ZERO_HASH;
    } catch {
      /* keep sentinels */
    }
    return {
      decision_id: `dec_${randomUUID()}`,
      mandate_id: mandateId,
      action_hash: actHash,
      verdict: 'DENY',
      reason_codes: ['VERIFIER_ERROR'],
      approved_snapshot_hash: approved,
      fetched_snapshot_hash: ZERO_HASH,
      decided_at: input?.now ?? 0,
      latency_ms: 0,
    };
  }
}

const dedupe = (codes: ReasonCode[]): ReasonCode[] => [...new Set(codes)];
