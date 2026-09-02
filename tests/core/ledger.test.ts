import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlLedger } from '../../src/core/ledger.js';
import { canonicalHash } from '../../src/core/crypto.js';
import {
  mandateFixture,
  decisionFixture,
  tokenFixture,
  executionFixture,
  webhookFixture,
} from '../../src/contracts/fixtures.js';

const GENESIS_PREV = '0'.repeat(64);
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rp-ledger-'));
  path = join(dir, 'ledger.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ledger: genesis + append', () => {
  it('creates a genesis entry with zero prev_hash', async () => {
    const ledger = new JsonlLedger(path);
    expect(ledger.verifyChain()).toBe(true);
    const first = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(first).toHaveLength(1);
    expect(first[0].seq).toBe(0);
    expect(first[0].type).toBe('genesis');
    expect(first[0].prev_hash).toBe(GENESIS_PREV);
  });

  it('append returns chained entries with monotonic seq', async () => {
    const ledger = new JsonlLedger(path);
    const e1 = await ledger.append('mandate.issued', mandateFixture);
    const e2 = await ledger.append('decision.recorded', decisionFixture);
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e2.prev_hash).toBe(e1.entry_hash);
    expect(e1.entry_hash).toBe(canonicalHash({
      seq: 1, type: 'mandate.issued', payload: mandateFixture, prev_hash: e1.prev_hash, at: e1.at,
    }));
  });

  it('keeps monotonic seq even when the injected clock is fixed', async () => {
    const ledger = new JsonlLedger(path, () => 1_757_000_000_000);
    const e1 = await ledger.append('decision.recorded', decisionFixture);
    const e2 = await ledger.append('decision.recorded', decisionFixture);
    expect(e1.at).toBe(e2.at);
    expect(e2.seq).toBe(e1.seq + 1);
  });
});

describe('ledger: replay derives state', () => {
  it('replays typed entries into all state maps', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('mandate.issued', mandateFixture);
    await ledger.append('decision.recorded', decisionFixture);
    await ledger.append('token.issued', tokenFixture);
    await ledger.append('token.used', { token_id: tokenFixture.token_id });
    await ledger.append('execution.recorded', executionFixture);
    await ledger.append('webhook.recorded', webhookFixture);

    const state = ledger.replay();
    expect(state.mandates.get('mnd_0001')).toEqual(mandateFixture);
    expect(state.decisions.get('dec_0001')).toEqual(decisionFixture);
    expect(state.tokens.get('tok_0001')?.used).toBe(true);
    expect(state.executions.get('exe_0001')).toEqual(executionFixture);
    expect(state.webhookEvents.get('evt_0001')).toEqual(webhookFixture);
  });

  it('applies mandate lifecycle transitions', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('mandate.issued', mandateFixture);
    await ledger.append('mandate.consumed', { mandate_id: 'mnd_0001' });
    expect(ledger.replay().mandates.get('mnd_0001')?.status).toBe('CONSUMED');
  });

  it('state survives reopen (durability)', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('mandate.issued', mandateFixture);
    const reopened = new JsonlLedger(path);
    expect(reopened.replay().mandates.get('mnd_0001')).toEqual(mandateFixture);
  });

  it('throws on unknown entry type (fail closed)', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('decision.recorded', decisionFixture);
    // hand-craft a VALIDLY CHAINED entry with an alien type
    const tail = JSON.parse(readFileSync(path, 'utf8').trim().split('\n').pop()!);
    const alien = { seq: tail.seq + 1, type: 'alien.tech', payload: {}, prev_hash: tail.entry_hash, at: 1 };
    const entry_hash = canonicalHash(alien);
    writeFileSync(path, JSON.stringify({ ...alien, entry_hash }) + '\n', { flag: 'a' });
    expect(() => new JsonlLedger(path).replay()).toThrow(/unknown/i);
  });
});

describe('ledger: tamper detection (I11)', () => {
  it('verifyChain true on clean ledger, false after byte flip', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('mandate.issued', mandateFixture);
    await ledger.append('decision.recorded', decisionFixture);
    expect(ledger.verifyChain()).toBe(true);

    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    const entry = JSON.parse(lines[1]!);
    entry.payload = { ...entry.payload, status: 'CONSUMED' }; // silent state change
    lines[1] = JSON.stringify(entry);
    writeFileSync(path, lines.join('\n') + '\n');

    expect(new JsonlLedger(path).verifyChain()).toBe(false);
    expect(() => new JsonlLedger(path).replay()).toThrow(/chain/i);
  });

  it('detects a flipped byte inside entry_hash', async () => {
    const ledger = new JsonlLedger(path);
    await ledger.append('mandate.issued', mandateFixture);
    const raw = readFileSync(path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const entry = JSON.parse(lines[1]!);
    entry.entry_hash = (entry.entry_hash[0] === 'a' ? 'b' : 'a') + entry.entry_hash.slice(1);
    lines[1] = JSON.stringify(entry);
    writeFileSync(path, lines.join('\n') + '\n');
    expect(new JsonlLedger(path).verifyChain()).toBe(false);
  });
});
