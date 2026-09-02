import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, runTrace, generateAndRun, TRACE_CLASSES } from '../../src/harness/generator.js';

describe('generator: seeded determinism', () => {
  it('same seed → byte-identical trace specs', () => {
    expect(generate(42, 100)).toEqual(generate(42, 100));
  });

  it('different seed → different specs', () => {
    expect(generate(42, 100)).not.toEqual(generate(43, 100));
  });

  it('covers all 12 classes in a 1000-trace run', () => {
    const classes = new Set(generate(42, 1000).map((t) => t.class));
    expect(classes.size).toBe(12);
    for (const c of TRACE_CLASSES) expect(classes.has(c)).toBe(true);
  });
});

describe('generator: oracle self-consistency (sampled execution)', () => {
  it('first 24 traces (2 per class) all match their declared oracle', async () => {
    const traces = generate(42, 24);
    for (const t of traces) {
      const r = await runTrace(t);
      expect(r.pass, `${t.class} trace ${t.trace_id} failed: ${JSON.stringify(r.observed)} vs ${JSON.stringify(r.expected)}`).toBe(true);
    }
  }, 60_000);
});

describe('generator: artifact', () => {
  it('same seed → identical artifact sha256', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-gen-'));
    try {
      const a = await generateAndRun(7, 24, join(dir, 'a.jsonl'));
      const b = await generateAndRun(7, 24, join(dir, 'b.jsonl'));
      expect(a.sha256).toBe(b.sha256);
      expect(a.total).toBe(24);
      expect(a.passed).toBe(24);
      const line = readFileSync(join(dir, 'a.jsonl'), 'utf8').split('\n')[0]!;
      const parsed = JSON.parse(line);
      expect(parsed.label).toBe('SYNTHETIC');
      expect(parsed).toHaveProperty('trace_id');
      expect(parsed).toHaveProperty('expected');
      expect(parsed).toHaveProperty('pass');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('artifact hash changes with seed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-gen2-'));
    try {
      const a = await generateAndRun(7, 12, join(dir, 'a.jsonl'));
      const b = await generateAndRun(8, 12, join(dir, 'b.jsonl'));
      expect(a.sha256).not.toBe(b.sha256);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('sha256 helper matches file content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-gen3-'));
    try {
      const r = await generateAndRun(9, 12, join(dir, 'c.jsonl'));
      const actual = createHash('sha256').update(readFileSync(join(dir, 'c.jsonl'), 'utf8')).digest('hex');
      expect(r.sha256).toBe(actual);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
