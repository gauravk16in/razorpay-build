import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// I9 / SEC1: the LLM layer must have NO code path to execution authority.
const IMPORT_RE = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g;
const FORBIDDEN_FOR_LLM = [/core\/executor/, /adapters\/razorpay/, /core\/ledger/];

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(IMPORT_RE)].map((m) => m[1]!);
}

const LLM_FILES = ['intent.ts', 'intent.stub.ts', 'llm-client.ts'].map((f) =>
  join(__dirname, '../../src/adapters', f),
);

describe('architecture: LLM has no authority (I9)', () => {
  it('intent adapter files never import executor, razorpay, or ledger', () => {
    for (const file of LLM_FILES) {
      const imports = importsOf(file);
      for (const spec of imports) {
        for (const forbidden of FORBIDDEN_FOR_LLM) {
          expect(forbidden.test(spec), `${file} must not import ${spec}`).toBe(false);
        }
      }
    }
  });

  it('the verifier never imports adapters', () => {
    const imports = importsOf(join(__dirname, '../../src/core/verifier.ts'));
    for (const spec of imports) {
      expect(spec.includes('adapters'), `verifier must not import ${spec}`).toBe(false);
    }
  });

  it('no file in src/adapters imports the executor', () => {
    const dir = join(__dirname, '../../src/adapters');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      for (const spec of importsOf(join(dir, f))) {
        expect(spec.includes('core/executor'), `${f} must not import ${spec}`).toBe(false);
      }
    }
  });
});
