import { describe, it, expect } from 'vitest';
import { runDemo, type DemoResult } from '../../src/demo/scenario.js';
import { hp, renderBeat } from '../../src/demo/format.js';

describe('demo: dry-run executes all six beats (DM1–DM6)', () => {
  let result: DemoResult;
  const printed: string[] = [];

  it('runs and passes everything with the fake gateway', async () => {
    result = await runDemo({ mode: 'dry', print: (s) => printed.push(s) });
    expect(result.allPassed).toBe(true);
    expect(result.beats).toHaveLength(6);
    expect(result.stats.chainValid).toBe(true);
  }, 60_000);

  it('DM1: valid action allowed and executed', () => {
    const b = result.beats.find((x) => x.id === 'DM1')!;
    expect(b.decisions[0]?.verdict).toBe('ALLOW');
    expect(b.orderIds.length).toBe(1);
    expect(b.ok).toBe(true);
  });

  it('DM2: amount mutation denied, no new Razorpay call', () => {
    const b = result.beats.find((x) => x.id === 'DM2')!;
    expect(b.decisions[0]?.verdict).toBe('DENY');
    expect(b.decisions[0]?.reason_codes).toContain('AMOUNT_MISMATCH');
    expect(b.orderIds).toHaveLength(0);
  });

  it('DM3: merchant substitution denied', () => {
    const b = result.beats.find((x) => x.id === 'DM3')!;
    expect(b.decisions[0]?.reason_codes).toContain('MERCHANT_MISMATCH');
  });

  it('DM4: replay denied after one valid execution', () => {
    const b = result.beats.find((x) => x.id === 'DM4')!;
    expect(b.decisions.map((d) => d.verdict)).toEqual(['ALLOW', 'DENY']);
    expect(b.decisions[1]?.reason_codes).toContain('MANDATE_CONSUMED');
    expect(b.orderIds.length).toBe(1);
  });

  it('DM5: checkout change → deny + re-approval → allow', () => {
    const b = result.beats.find((x) => x.id === 'DM5')!;
    expect(b.decisions.map((d) => d.verdict)).toEqual(['DENY', 'ALLOW']);
    expect(b.decisions[0]?.reason_codes).toEqual(['CHECKOUT_CHANGED']);
    expect(b.decisions[0]?.next_action).toBe('REQUIRE_REAPPROVAL');
    expect(b.orderIds.length).toBe(1);
  });

  it('DM6: duplicate webhook processed once', () => {
    const b = result.beats.find((x) => x.id === 'DM6')!;
    expect(b.notes.join(' ')).toContain('PROCESSED');
    expect(b.notes.join(' ')).toContain('DUPLICATE');
  });

  it('exactly 3 orders created across the dry demo (DM1, DM4, DM5)', () => {
    expect(result.stats.razorpayCalls).toBe(3);
  });

  it('beats carry evidence labels', () => {
    for (const b of result.beats) {
      expect(b.label).toMatch(/REAL_TEST_MODE|REPLAYED|SYNTHETIC|MODELLED/);
    }
  });

  it('printed output includes verdicts and hash prefixes', () => {
    const out = printed.join('\n');
    expect(out).toContain('ALLOW');
    expect(out).toContain('DENY');
    expect(out).toContain('CHECKOUT_CHANGED');
  });
});

describe('demo: formatting', () => {
  it('hp() shortens hashes to 12 chars', () => {
    expect(hp('abcdef'.repeat(11))).toBe('abcdefabcdef');
    expect(hp('abcdef'.repeat(11))).toHaveLength(12);
  });

  it('renderBeat shows verdict, codes, and label', () => {
    const fakeBeat = {
      id: 'DM1',
      title: 'Valid purchase',
      label: 'SYNTHETIC' as const,
      ok: true,
      decisions: [
        {
          decision_id: 'dec_1',
          mandate_id: 'mnd_1',
          action_hash: 'a'.repeat(64),
          verdict: 'ALLOW' as const,
          reason_codes: ['OK' as const],
          approved_snapshot_hash: 'b'.repeat(64),
          fetched_snapshot_hash: 'b'.repeat(64),
          decided_at: 1,
          latency_ms: 0.5,
        },
      ],
      orderIds: ['order_X1'],
      notes: [],
    };
    const text = renderBeat(fakeBeat);
    expect(text).toContain('ALLOW');
    expect(text).toContain('SYNTHETIC');
    expect(text).toContain('order_X1');
    expect(text).toContain('bbbbbbbbbbbb');
  });
});
