import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as S from '../../src/contracts/schemas.js';
import * as F from '../../src/contracts/fixtures.js';
import { REASON_CODES } from '../../src/contracts/reason-codes.js';

const roundTrips: Array<[string, z.ZodTypeAny, unknown]> = [
  ['CheckoutSnapshot', S.CheckoutSnapshotSchema, F.snapshotFixture],
  ['Constraints', S.ConstraintsSchema, F.constraintsFixture],
  ['ConstraintsDraft', S.ConstraintsDraftSchema, F.constraintsDraftFixture],
  ['Mandate', S.MandateSchema, F.mandateFixture],
  ['ProposedAction', S.ProposedActionSchema, F.actionFixture],
  ['Decision', S.DecisionSchema, F.decisionFixture],
  ['ExecutionToken', S.ExecutionTokenSchema, F.tokenFixture],
  ['ExecutionRecord', S.ExecutionRecordSchema, F.executionFixture],
  ['WebhookEventRecord', S.WebhookEventRecordSchema, F.webhookFixture],
  ['LedgerEntry', S.LedgerEntrySchema, F.ledgerEntryFixture],
];

describe('contracts: fixtures round-trip', () => {
  it.each(roundTrips)('%s fixture parses and deep-equals input', (_name, schema, fixture) => {
    expect(schema.parse(fixture)).toEqual(fixture);
  });
});

describe('contracts: reason codes', () => {
  it('freezes exactly 18 reason codes', () => {
    expect(REASON_CODES).toHaveLength(18);
    expect(REASON_CODES).toContain('OK');
  });
});

describe('contracts: strict rejections', () => {
  it('rejects unknown reason code', () => {
    expect(
      S.DecisionSchema.safeParse({ ...F.decisionFixture, reason_codes: ['NOT_A_CODE'] }).success,
    ).toBe(false);
  });

  it('rejects negative amount_paise', () => {
    expect(
      S.ProposedActionSchema.safeParse({ ...F.actionFixture, amount_paise: -5 }).success,
    ).toBe(false);
  });

  it('rejects non-integer amount_paise', () => {
    expect(
      S.ProposedActionSchema.safeParse({ ...F.actionFixture, amount_paise: 1999.5 }).success,
    ).toBe(false);
  });

  it('rejects 63-char hash', () => {
    expect(
      S.DecisionSchema.safeParse({ ...F.decisionFixture, action_hash: 'a'.repeat(63) }).success,
    ).toBe(false);
  });

  it('rejects missing required field', () => {
    const { signature: _omitted, ...noSig } = F.mandateFixture;
    expect(S.MandateSchema.safeParse(noSig).success).toBe(false);
  });

  it('rejects extra unknown field (strict)', () => {
    expect(
      S.CheckoutSnapshotSchema.safeParse({ ...F.snapshotFixture, hacker_field: true }).success,
    ).toBe(false);
  });

  it('rejects lowercase currency', () => {
    expect(
      S.ProposedActionSchema.safeParse({ ...F.actionFixture, currency: 'inr' }).success,
    ).toBe(false);
  });

  it('rejects receipt over 40 chars', () => {
    expect(
      S.ExecutionRecordSchema.safeParse({ ...F.executionFixture, receipt: 'r'.repeat(41) })
        .success,
    ).toBe(false);
  });

  it('rejects empty items array', () => {
    expect(S.CheckoutSnapshotSchema.safeParse({ ...F.snapshotFixture, items: [] }).success).toBe(
      false,
    );
  });
});
