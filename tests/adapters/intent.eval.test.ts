import { describe, it, expect } from 'vitest';
import {
  loadCorpus,
  unsafeUnderConstraint,
  runEval,
  type CorpusEntry,
} from '../../src/adapters/intent.eval.js';
import { StubIntentProvider } from '../../src/adapters/intent.stub.js';
import { ConstraintsDraftSchema } from '../../src/contracts/schemas.js';

describe('intent corpus: validity', () => {
  const entries = loadCorpus('eval/corpus');

  it('has ≥40 entries with ≥8 ambiguous', () => {
    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(entries.filter((e) => e.ambiguity === 'ambiguous')).toHaveLength(9);
  });

  it('every clear entry has a schema-valid gold; every ambiguous entry has null gold', () => {
    for (const e of entries) {
      if (e.ambiguity === 'clear') {
        expect(ConstraintsDraftSchema.safeParse(e.gold).success, e.id).toBe(true);
      } else {
        expect(e.gold, e.id).toBeNull();
      }
    }
  });
});

describe('unsafe-under-constraint comparator', () => {
  const gold = { merchant_id: 'sonicstore', max_amount_paise: 200_000, currency: 'INR', item_skus: ['hp-001'] };

  it('higher cap = unsafe', () => {
    expect(unsafeUnderConstraint({ ...gold, max_amount_paise: 200_001 }, gold)).toBe(true);
  });

  it('strictly larger item set = unsafe', () => {
    expect(unsafeUnderConstraint({ ...gold, item_skus: ['hp-001', 'kb-001'] }, gold)).toBe(true);
  });

  it('equal = safe', () => {
    expect(unsafeUnderConstraint({ ...gold }, gold)).toBe(false);
  });

  it('TIGHTER cap is not unsafe-under-constraint (safe-but-wrong)', () => {
    expect(unsafeUnderConstraint({ ...gold, max_amount_paise: 100_000 }, gold)).toBe(false);
  });

  it('different items (not superset) is not unsafe-under-constraint', () => {
    expect(unsafeUnderConstraint({ ...gold, item_skus: ['kb-001'] }, gold)).toBe(false);
  });
});

describe('intent eval runner', () => {
  it('is deterministic on the stub provider (two runs identical)', async () => {
    const entries: CorpusEntry[] = loadCorpus('eval/corpus').slice(0, 6);
    const a = await runEval(new StubIntentProvider(), entries, 'stub-deterministic');
    const b = await runEval(new StubIntentProvider(), entries, 'stub-deterministic');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('stub scores exact matches on its scripted hero phrases', async () => {
    const entries = loadCorpus('eval/corpus');
    const result = await runEval(new StubIntentProvider(), entries, 'stub-deterministic');
    const hits = result.cases.filter((c) => c.exact_match);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(result.label).toBe('SYNTHETIC');
    expect(result.model).toBe('stub-deterministic');
  });

  it('ambiguous entries: clarify is the correct outcome (not exact_match)', async () => {
    const entries = loadCorpus('eval/corpus').filter((e) => e.ambiguity === 'ambiguous');
    const result = await runEval(new StubIntentProvider(), entries, 'stub-deterministic');
    for (const c of result.cases) {
      expect(c.exact_match).toBe(false);
      expect(c.unsafe_under_constraint).toBe(false);
      expect(c.clarify_correct).toBe(true); // stub clarifies unknown phrases
    }
  });
});
