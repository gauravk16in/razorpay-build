import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { canonicalHash } from './crypto.js';
import {
  LedgerEntrySchema,
  MandateSchema,
  DecisionSchema,
  ExecutionTokenSchema,
  ExecutionRecordSchema,
  WebhookEventRecordSchema,
  type LedgerEntry,
} from '../contracts/schemas.js';
import type { Ledger, LedgerState } from '../contracts/interfaces.js';

export class CorruptedLedgerError extends Error {}

const GENESIS_PREV = '0'.repeat(64);

type EntryCore = Omit<LedgerEntry, 'entry_hash'>;

const hashEntry = (e: EntryCore): string => canonicalHash(e);

// Append-only hash-chained JSONL store (PLAN.md D3): the ledger IS the
// database and the evidence trail. Single-writer; sync fs + fsync per append.
export class JsonlLedger implements Ledger {
  private entries: LedgerEntry[] | null = null;

  constructor(
    private readonly path: string,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async append(type: string, payload: unknown): Promise<LedgerEntry> {
    const entries = this.loadEntries();
    const tail = entries[entries.length - 1]!;
    const core: EntryCore = {
      seq: tail.seq + 1,
      type,
      payload,
      prev_hash: tail.entry_hash,
      at: this.clock(),
    };
    const entry: LedgerEntry = { ...core, entry_hash: hashEntry(core) };
    const fd = openSync(this.path, 'a');
    try {
      appendFileSync(fd, JSON.stringify(entry) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    entries.push(entry);
    return entry;
  }

  replay(): LedgerState {
    const state: LedgerState = {
      mandates: new Map(),
      decisions: new Map(),
      tokens: new Map(),
      executions: new Map(),
      webhookEvents: new Map(),
    };
    for (const e of this.loadEntries()) {
      switch (e.type) {
        case 'genesis':
          break;
        case 'mandate.issued': {
          const m = MandateSchema.parse(e.payload);
          state.mandates.set(m.mandate_id, m);
          break;
        }
        case 'mandate.consumed': {
          const p = z.object({ mandate_id: z.string() }).parse(e.payload);
          const m = state.mandates.get(p.mandate_id);
          if (!m) throw new Error(`ledger replay: consume of unknown mandate ${p.mandate_id}`);
          state.mandates.set(m.mandate_id, { ...m, status: 'CONSUMED' });
          break;
        }
        case 'mandate.superseded': {
          const p = z.object({ old_id: z.string(), new_mandate: MandateSchema }).parse(e.payload);
          const old = state.mandates.get(p.old_id);
          if (!old) throw new Error(`ledger replay: supersede of unknown mandate ${p.old_id}`);
          state.mandates.set(p.old_id, {
            ...old,
            status: 'SUPERSEDED',
            superseded_by: p.new_mandate.mandate_id,
          });
          state.mandates.set(p.new_mandate.mandate_id, p.new_mandate);
          break;
        }
        case 'decision.recorded': {
          const d = DecisionSchema.parse(e.payload);
          state.decisions.set(d.decision_id, d);
          break;
        }
        case 'token.issued': {
          const t = ExecutionTokenSchema.parse(e.payload);
          state.tokens.set(t.token_id, t);
          break;
        }
        case 'token.used': {
          const p = z.object({ token_id: z.string() }).parse(e.payload);
          const t = state.tokens.get(p.token_id);
          if (!t) throw new Error(`ledger replay: use of unknown token ${p.token_id}`);
          state.tokens.set(t.token_id, { ...t, used: true });
          break;
        }
        case 'execution.recorded': {
          const r = ExecutionRecordSchema.parse(e.payload);
          state.executions.set(r.execution_id, r);
          break;
        }
        case 'webhook.recorded': {
          const w = WebhookEventRecordSchema.parse(e.payload);
          state.webhookEvents.set(w.event_id, w);
          break;
        }
        default:
          throw new Error(`ledger replay: unknown entry type "${e.type}" (fail closed)`);
      }
    }
    return state;
  }

  verifyChain(): boolean {
    try {
      this.loadEntries();
      return true;
    } catch (err) {
      if (err instanceof CorruptedLedgerError) return false;
      throw err;
    }
  }

  private loadEntries(): LedgerEntry[] {
    if (this.entries) return this.entries;
    if (!existsSync(this.path) || readFileSync(this.path, 'utf8').trim() === '') {
      this.entries = [];
      this.writeGenesis();
      return this.entries;
    }
    const lines = readFileSync(this.path, 'utf8').split('\n').filter((l) => l.trim() !== '');
    const parsed = lines.map((l, i) => {
      try {
        return LedgerEntrySchema.parse(JSON.parse(l));
      } catch (err) {
        throw new CorruptedLedgerError(`ledger chain broken at line ${i}: unparseable entry`);
      }
    });
    for (let i = 0; i < parsed.length; i++) {
      const e = parsed[i]!;
      if (e.seq !== i) throw new CorruptedLedgerError(`ledger chain broken at seq ${i}`);
      const { entry_hash, ...core } = e;
      if (hashEntry(core) !== entry_hash) {
        throw new CorruptedLedgerError(`ledger chain broken: entry_hash mismatch at seq ${i}`);
      }
      const expectedPrev = i === 0 ? GENESIS_PREV : parsed[i - 1]!.entry_hash;
      if (e.prev_hash !== expectedPrev) {
        throw new CorruptedLedgerError(`ledger chain broken: prev_hash mismatch at seq ${i}`);
      }
    }
    this.entries = parsed;
    return this.entries;
  }

  private writeGenesis(): void {
    const core: EntryCore = { seq: 0, type: 'genesis', payload: {}, prev_hash: GENESIS_PREV, at: this.clock() };
    const entry: LedgerEntry = { ...core, entry_hash: hashEntry(core) };
    const fd = openSync(this.path, 'a');
    try {
      appendFileSync(fd, JSON.stringify(entry) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.entries = [entry];
  }
}
