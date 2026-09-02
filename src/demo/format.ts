import type { Decision } from '../contracts/schemas.js';

export const hp = (hash: string): string => hash.slice(0, 12);

export interface BeatResult {
  id: string;
  title: string;
  label: 'REAL_TEST_MODE' | 'REPLAYED' | 'SYNTHETIC' | 'MODELLED';
  ok: boolean;
  decisions: Decision[];
  orderIds: string[];
  notes: string[];
}

export function renderBeat(b: BeatResult): string {
  const lines: string[] = [];
  lines.push(`\n=== ${b.id}: ${b.title}  [${b.label}] ===`);
  for (const d of b.decisions) {
    const mark = d.verdict === 'ALLOW' ? 'ALLOW ✓' : 'DENY ✗';
    lines.push(`  ${mark}  reason_codes=[${d.reason_codes.join(', ')}]  latency=${d.latency_ms.toFixed(2)}ms`);
    lines.push(`    mandate=${b.id === 'DM5' ? 'v1/v2' : hp(d.mandate_id.padEnd(12, '…'))}  approved=${hp(d.approved_snapshot_hash)}  fetched=${hp(d.fetched_snapshot_hash)}`);
    if (d.next_action) lines.push(`    next_action=${d.next_action}`);
  }
  for (const oid of b.orderIds) lines.push(`  razorpay order: ${oid}`);
  for (const n of b.notes) lines.push(`  ${n}`);
  lines.push(`  → ${b.ok ? 'BEAT OK' : 'BEAT FAILED'}`);
  return lines.join('\n');
}
