import { randomUUID } from 'node:crypto';
import { signPayload, snapshotHash, verifyPayload } from './crypto.js';
import type { Ledger } from '../contracts/interfaces.js';
import type { CheckoutSnapshot, Constraints, Mandate } from '../contracts/schemas.js';

export const MANDATE_TTL_MS = 10 * 60 * 1000;

export class MandateIssuanceError extends Error {}
export class MandateStateError extends Error {}

// Signature covers ONLY immutable issuance fields. Lifecycle fields
// (status, superseded_by) are derived/ledger-managed and never signed.
export function mandateSigningCore(m: Mandate): Record<string, unknown> {
  return {
    mandate_id: m.mandate_id,
    constraints: m.constraints,
    approved_snapshot_hash: m.approved_snapshot_hash,
    issued_at: m.issued_at,
    expires_at: m.expires_at,
    nonce: m.nonce,
  };
}

export class MandateService {
  constructor(
    private readonly ledger: Ledger,
    private readonly hmacKey: string,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async issueMandate(constraints: Constraints, approvedSnapshot: CheckoutSnapshot): Promise<Mandate> {
    this.assertIssuable(constraints, approvedSnapshot);
    const now = this.clock();
    const core = {
      mandate_id: `mnd_${randomUUID()}`,
      constraints,
      approved_snapshot_hash: snapshotHash(approvedSnapshot),
      issued_at: now,
      expires_at: now + MANDATE_TTL_MS,
      nonce: randomUUID(),
      status: 'ACTIVE' as const,
    };
    const mandate: Mandate = { ...core, signature: signPayload(mandateSigningCore(core as Mandate), this.hmacKey) };
    await this.ledger.append('mandate.issued', mandate);
    return mandate;
  }

  async supersede(
    mandateId: string,
    newConstraints: Constraints,
    newSnapshot: CheckoutSnapshot,
  ): Promise<Mandate> {
    const old = this.getMandate(mandateId);
    if (old.status === 'CONSUMED') {
      throw new MandateStateError(`mandate ${mandateId} is CONSUMED; cannot supersede`);
    }
    this.assertIssuable(newConstraints, newSnapshot);
    const now = this.clock();
    const core = {
      mandate_id: `mnd_${randomUUID()}`,
      constraints: newConstraints,
      approved_snapshot_hash: snapshotHash(newSnapshot),
      issued_at: now,
      expires_at: now + MANDATE_TTL_MS,
      nonce: randomUUID(),
      status: 'ACTIVE' as const,
    };
    const newMandate: Mandate = { ...core, signature: signPayload(mandateSigningCore(core as Mandate), this.hmacKey) };
    await this.ledger.append('mandate.superseded', { old_id: mandateId, new_mandate: newMandate });
    return newMandate;
  }

  async consume(mandateId: string): Promise<void> {
    const m = this.getMandate(mandateId);
    if (m.status === 'CONSUMED') throw new MandateStateError(`mandate ${mandateId} already CONSUMED`);
    if (m.status === 'EXPIRED') throw new MandateStateError(`mandate ${mandateId} is EXPIRED`);
    if (m.status === 'SUPERSEDED') throw new MandateStateError(`mandate ${mandateId} is SUPERSEDED`);
    await this.ledger.append('mandate.consumed', { mandate_id: mandateId });
  }

  // Derived view: EXPIRED is computed from the clock, never stored (§05).
  getMandate(mandateId: string): Mandate {
    const m = this.ledger.replay().mandates.get(mandateId);
    if (!m) throw new MandateStateError(`unknown mandate ${mandateId}`);
    if (m.status === 'ACTIVE' && this.clock() > m.expires_at) return { ...m, status: 'EXPIRED' };
    return m;
  }

  verifyMandate(mandate: Mandate): boolean {
    return verifyPayload(mandateSigningCore(mandate), mandate.signature, this.hmacKey);
  }

  private assertIssuable(constraints: Constraints, snapshot: CheckoutSnapshot): void {
    if (snapshot.merchant_id !== constraints.merchant_id) {
      throw new MandateIssuanceError('MERCHANT_MISMATCH: snapshot merchant does not match constraints');
    }
    if (snapshot.currency !== constraints.currency) {
      throw new MandateIssuanceError('CURRENCY_MISMATCH: snapshot currency does not match constraints');
    }
    if (snapshot.amount_paise > constraints.max_amount_paise) {
      throw new MandateIssuanceError('OVER_LIMIT: snapshot amount exceeds max_amount_paise');
    }
  }
}
