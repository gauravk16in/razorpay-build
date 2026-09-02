import type { Decision } from '../contracts/schemas.js';
import type { WiredSystem } from './wiring.js';

export interface ScenarioObservation {
  decisions: Decision[];
  razorpayCalls: number;
  executionsCreated: number;
  webhookOutcomes?: Array<{ status: number; processed: string }>;
}

export interface ScenarioExpectation {
  verdict?: 'ALLOW' | 'DENY';
  reason_codes?: string[];
  next_action?: 'REQUIRE_REAPPROVAL';
  razorpayCalls?: number;
  executionsCreated?: number;
  webhookOutcomes?: Array<{ status: number; processed: string }>;
}

export interface Scenario {
  id: string;
  class: string;
  expected: ScenarioExpectation;
  run: (sys: WiredSystem) => Promise<ScenarioObservation>;
  // Optional scenario-specific extra checks (e.g., multi-phase flows).
  check?: (obs: ScenarioObservation) => string[];
}

const last = (decisions: Decision[]): Decision | undefined => decisions[decisions.length - 1];

export function assertObservation(s: Scenario, obs: ScenarioObservation): string[] {
  const failures: string[] = [];
  const e = s.expected;
  const d = last(obs.decisions);

  if (e.verdict !== undefined) {
    if (!d) failures.push('expected a decision, none recorded');
    else if (d.verdict !== e.verdict) failures.push(`verdict: expected ${e.verdict}, got ${d.verdict}`);
  }
  if (e.reason_codes !== undefined && d) {
    const want = [...e.reason_codes].sort();
    const got = [...d.reason_codes].sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      failures.push(`reason_codes: expected [${want}], got [${got}]`);
    }
  }
  if (e.next_action !== undefined && d?.next_action !== e.next_action) {
    failures.push(`next_action: expected ${e.next_action}, got ${d?.next_action ?? 'none'}`);
  }
  if (e.razorpayCalls !== undefined && obs.razorpayCalls !== e.razorpayCalls) {
    failures.push(`razorpay calls: expected ${e.razorpayCalls}, got ${obs.razorpayCalls}`);
  }
  if (e.executionsCreated !== undefined && obs.executionsCreated !== e.executionsCreated) {
    failures.push(`executions: expected ${e.executionsCreated}, got ${obs.executionsCreated}`);
  }
  if (e.webhookOutcomes !== undefined) {
    if (JSON.stringify(e.webhookOutcomes) !== JSON.stringify(obs.webhookOutcomes ?? [])) {
      failures.push(
        `webhook outcomes: expected ${JSON.stringify(e.webhookOutcomes)}, got ${JSON.stringify(obs.webhookOutcomes ?? [])}`,
      );
    }
  }
  if (s.check) failures.push(...s.check(obs));
  return failures;
}

// Invariants checked after EVERY scenario (I1, I6, I11).
export function assertSystemInvariants(sys: WiredSystem): string[] {
  const failures: string[] = [];
  if (!sys.ledger.verifyChain()) failures.push('I11: ledger hash chain invalid');
  const state = sys.ledger.replay();
  for (const exec of state.executions.values()) {
    const decision = state.decisions.get(exec.decision_id);
    if (!decision) failures.push(`I1: execution ${exec.execution_id} has no matching decision`);
    else if (decision.verdict !== 'ALLOW')
      failures.push(`I1: execution ${exec.execution_id} links to a ${decision.verdict} decision`);
  }
  for (const d of state.decisions.values()) {
    if (d.reason_codes.length === 0) failures.push(`I6: decision ${d.decision_id} has no reason codes`);
  }
  return failures;
}
