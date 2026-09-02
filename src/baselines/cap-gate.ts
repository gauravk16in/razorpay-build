import { randomUUID } from 'node:crypto';
import { actionHash, snapshotHash } from '../core/crypto.js';
import type { Gate, VerifierInput } from '../contracts/interfaces.js';
import type { Decision } from '../contracts/schemas.js';

// Baseline B2 (PLAN.md §08): amount-cap-only gate. Blind to merchant, replay,
// checkout state, and mandate integrity BY DESIGN — that blindness is the
// comparison point the evaluation measures.
export class CapGate implements Gate {
  decide(input: VerifierInput): Decision {
    const allow = input.action.amount_paise <= input.mandate.constraints.max_amount_paise;
    return {
      decision_id: `dec_${randomUUID()}`,
      mandate_id: input.mandate.mandate_id,
      action_hash: actionHash(input.action),
      verdict: allow ? 'ALLOW' : 'DENY',
      reason_codes: [allow ? 'OK' : 'OVER_LIMIT'],
      approved_snapshot_hash: input.mandate.approved_snapshot_hash,
      fetched_snapshot_hash: input.fetched.ok ? snapshotHash(input.fetched.snapshot) : '0'.repeat(64),
      decided_at: input.now,
      latency_ms: 0,
    };
  }
}
