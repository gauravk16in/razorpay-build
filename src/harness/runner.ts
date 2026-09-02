import { rmSync } from 'node:fs';
import { buildSystem, type AnyGate, type WiredSystem } from './wiring.js';
import { assertObservation, assertSystemInvariants, type Scenario, type ScenarioObservation } from './assert.js';

export interface HarnessResult {
  id: string;
  class: string;
  pass: boolean;
  failures: string[];
  observation: ScenarioObservation | null;
}

export async function runScenario(s: Scenario, gate?: AnyGate): Promise<HarnessResult> {
  const own = buildSystem();
  if (gate) own.gate = gate;
  try {
    const observation = await s.run(own);
    const failures = [...assertObservation(s, observation), ...assertSystemInvariants(own)];
    return { id: s.id, class: s.class, pass: failures.length === 0, failures, observation };
  } catch (err) {
    return {
      id: s.id,
      class: s.class,
      pass: false,
      failures: [`uncaught: ${(err as Error).message}`],
      observation: null,
    };
  } finally {
    rmSync(own.dir, { recursive: true, force: true });
  }
}

export async function runAll(scenarios: Scenario[], gate?: AnyGate): Promise<HarnessResult[]> {
  const results: HarnessResult[] = [];
  for (const s of scenarios) {
    results.push(await runScenario(s, gate));
  }
  return results;
}
