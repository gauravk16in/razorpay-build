import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '../../src/harness/scenarios.js';
import type { Scenario } from '../../src/harness/assert.js';
import { runAll, runScenario } from '../../src/harness/runner.js';
import { buildSystem, issueForCurrentCart, actionFor, runAction } from '../../src/harness/wiring.js';

describe('harness: adversarial suite vs RupeeProof gate', () => {
  it('every scenario passes', async () => {
    const results = await runAll(SCENARIOS);
    const failed = results.filter((r) => !r.pass);
    expect(
      failed.map((f) => ({ id: f.id, failures: f.failures })),
      `${failed.length} scenario(s) failed`,
    ).toEqual([]);
  });

  it('covers at least 12 scenario classes', () => {
    expect(new Set(SCENARIOS.map((s) => s.class)).size).toBeGreaterThanOrEqual(12);
  });
});

describe('harness: self-verification', () => {
  it('runner fails a scenario with a purposefully wrong expectation', async () => {
    const bogus: Scenario = {
      id: 'self-test-bogus',
      class: 'self-test',
      expected: { verdict: 'DENY', razorpayCalls: 0 },
      run: async (sys) => {
        const { mandate, snapshot } = await issueForCurrentCart(sys);
        const decision = await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
        return {
          decisions: [decision],
          razorpayCalls: sys.gateway.createOrderCalls,
          executionsCreated: sys.ledger.replay().executions.size,
        };
      },
    };
    const result = await runScenario(bogus);
    expect(result.pass).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('buildSystem produces an isolated, chain-valid system', async () => {
    const sys = buildSystem();
    const { mandate, snapshot } = await issueForCurrentCart(sys);
    await runAction(sys, mandate, actionFor(sys, mandate, snapshot));
    expect(sys.ledger.verifyChain()).toBe(true);
    expect(snapshot.merchant_id).toBe('sonicstore');
  });
});
