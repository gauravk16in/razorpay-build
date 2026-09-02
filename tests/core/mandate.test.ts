import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlLedger } from '../../src/core/ledger.js';
import { MandateService, MANDATE_TTL_MS } from '../../src/core/mandate.js';
import { constraintsFixture, snapshotFixture } from '../../src/contracts/fixtures.js';

const KEY = 'test-mandate-key';
const T0 = 1_757_000_000_000;

let dir: string;
let clock: { now: number };
let service: MandateService;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rp-mandate-'));
  clock = { now: T0 };
  service = new MandateService(new JsonlLedger(join(dir, 'ledger.jsonl')), KEY, () => clock.now);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('mandate: issuance', () => {
  it('issues a signed ACTIVE mandate with TTL expiry', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    expect(m.status).toBe('ACTIVE');
    expect(m.issued_at).toBe(T0);
    expect(m.expires_at).toBe(T0 + MANDATE_TTL_MS);
    expect(service.verifyMandate(m)).toBe(true);
    expect(service.getMandate(m.mandate_id).status).toBe('ACTIVE');
  });

  it('rejects issuance when snapshot amount exceeds cap (OVER_LIMIT)', async () => {
    await expect(
      service.issueMandate(constraintsFixture, { ...snapshotFixture, amount_paise: 200_001 }),
    ).rejects.toThrow(/OVER_LIMIT/);
  });

  it('rejects issuance on merchant mismatch', async () => {
    await expect(
      service.issueMandate(constraintsFixture, { ...snapshotFixture, merchant_id: 'evilstore' }),
    ).rejects.toThrow(/MERCHANT_MISMATCH/);
  });

  it('rejects issuance on currency mismatch', async () => {
    await expect(
      service.issueMandate(constraintsFixture, { ...snapshotFixture, currency: 'USD' }),
    ).rejects.toThrow(/CURRENCY_MISMATCH/);
  });
});

describe('mandate: signature integrity (I13)', () => {
  it('detects tampering of any signed field', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    expect(
      service.verifyMandate({ ...m, constraints: { ...m.constraints, max_amount_paise: 1 } }),
    ).toBe(false);
    expect(service.verifyMandate({ ...m, approved_snapshot_hash: 'f'.repeat(64) })).toBe(false);
  });

  it('lifecycle fields (status, superseded_by) are NOT signed', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    expect(service.verifyMandate({ ...m, status: 'CONSUMED' })).toBe(true);
  });
});

describe('mandate: consume (I3)', () => {
  it('consume once → CONSUMED; second consume throws', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    await service.consume(m.mandate_id);
    expect(service.getMandate(m.mandate_id).status).toBe('CONSUMED');
    await expect(service.consume(m.mandate_id)).rejects.toThrow(/CONSUMED/);
  });
});

describe('mandate: expiry (I4)', () => {
  it('status derives EXPIRED after expires_at and cannot be consumed', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    clock.now = T0 + MANDATE_TTL_MS + 1;
    expect(service.getMandate(m.mandate_id).status).toBe('EXPIRED');
    await expect(service.consume(m.mandate_id)).rejects.toThrow(/EXPIRED/);
  });
});

describe('mandate: supersede (re-approval)', () => {
  it('closes the old mandate with a link and issues a new ACTIVE one', async () => {
    const oldM = await service.issueMandate(constraintsFixture, snapshotFixture);
    const newSnapshot = { ...snapshotFixture, amount_paise: 189_900, fetched_at: T0 + 1_000 };
    const newM = await service.supersede(oldM.mandate_id, constraintsFixture, newSnapshot);
    const oldAfter = service.getMandate(oldM.mandate_id);
    expect(oldAfter.status).toBe('SUPERSEDED');
    expect(oldAfter.superseded_by).toBe(newM.mandate_id);
    expect(newM.status).toBe('ACTIVE');
    expect(service.verifyMandate(newM)).toBe(true);
  });

  it('refuses to supersede a CONSUMED mandate', async () => {
    const m = await service.issueMandate(constraintsFixture, snapshotFixture);
    await service.consume(m.mandate_id);
    await expect(
      service.supersede(m.mandate_id, constraintsFixture, snapshotFixture),
    ).rejects.toThrow(/CONSUMED/);
  });

  it('throws on unknown mandate id', () => {
    expect(() => service.getMandate('mnd_nope')).toThrow(/unknown/i);
  });
});
