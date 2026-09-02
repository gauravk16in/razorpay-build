import { describe, it, expect } from 'vitest';
import { CapGate } from '../../src/baselines/cap-gate.js';
import { LlmJudgeGate } from '../../src/baselines/llm-judge.js';
import type { VerifierInput } from '../../src/contracts/interfaces.js';
import { actionFixture, mandateFixture, snapshotFixture } from '../../src/contracts/fixtures.js';
import { SCENARIOS } from '../../src/harness/scenarios.js';
import { runScenario } from '../../src/harness/runner.js';

const T0 = 1_757_000_000_000;

function input(overrides: Partial<VerifierInput> = {}): VerifierInput {
  return {
    mandate: mandateFixture,
    action: actionFixture,
    fetched: { ok: true, snapshot: snapshotFixture },
    now: T0,
    ...overrides,
  };
}

describe('B2 cap-gate: only checks the cap', () => {
  const gate = new CapGate();

  it('allows a valid action', () => {
    expect(gate.decide(input()).verdict).toBe('ALLOW');
  });

  it('denies over-cap', () => {
    const d = gate.decide(input({ action: { ...actionFixture, amount_paise: 200_001 } }));
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toEqual(['OVER_LIMIT']);
  });

  it('BLINDNESS (asserted): allows merchant substitution', () => {
    const d = gate.decide(input({ action: { ...actionFixture, merchant_id: 'evilstore' } }));
    expect(d.verdict).toBe('ALLOW');
  });

  it('BLINDNESS (asserted): allows replay of a consumed mandate', () => {
    const d = gate.decide(input({ mandate: { ...mandateFixture, status: 'CONSUMED' } }));
    expect(d.verdict).toBe('ALLOW');
  });

  it('BLINDNESS (asserted): allows a tampered mandate', () => {
    const d = gate.decide(input({ mandate: { ...mandateFixture, signature: 'e'.repeat(64) } }));
    expect(d.verdict).toBe('ALLOW');
  });
});

describe('B1 llm-judge: fail-open by design', () => {
  const judge = (impl: () => Promise<unknown>) => new LlmJudgeGate({ chatJson: impl }, 'fake-model');

  it('LLM allow → ALLOW', async () => {
    const d = await judge(async () => ({ allow: true })).decide(input());
    expect(d.verdict).toBe('ALLOW');
  });

  it('LLM deny → DENY (baseline marker code)', async () => {
    const d = await judge(async () => ({ allow: false })).decide(input());
    expect(d.verdict).toBe('DENY');
    expect(d.reason_codes).toEqual(['VERIFIER_ERROR']);
  });

  it('FAIL-OPEN (asserted): malformed LLM output → ALLOW', async () => {
    const d = await judge(async () => 'not json at all').decide(input());
    expect(d.verdict).toBe('ALLOW');
  });

  it('FAIL-OPEN (asserted): LLM unavailable → ALLOW', async () => {
    const d = await judge(async () => {
      throw new Error('connection refused');
    }).decide(input());
    expect(d.verdict).toBe('ALLOW');
  });
});

describe('baselines under the harness', () => {
  it('cap-gate PASSES the valid scenario', async () => {
    const valid = SCENARIOS.find((s) => s.class === 'valid')!;
    const result = await runScenario(valid, new CapGate());
    expect(result.pass).toBe(true);
  });

  it('cap-gate FAILS merchant-substitution (evidence of blindness)', async () => {
    const merchantSwap = SCENARIOS.find((s) => s.class === 'merchant-substitution')!;
    const result = await runScenario(merchantSwap, new CapGate());
    expect(result.pass).toBe(false);
    expect(result.failures.join(' ')).toContain('ALLOW');
  });

  it('cap-gate FAILS replay (evidence of blindness)', async () => {
    const replay = SCENARIOS.find((s) => s.class === 'replay')!;
    const result = await runScenario(replay, new CapGate());
    expect(result.pass).toBe(false);
  });
});
