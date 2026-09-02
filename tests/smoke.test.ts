import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SCAFFOLD_OK } from '../src/index.js';

describe('scaffold smoke', () => {
  it('arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });

  it('zod is importable and parses', () => {
    expect(z.string().parse('ok')).toBe('ok');
  });

  it('src placeholder is reachable', () => {
    expect(SCAFFOLD_OK).toBe(true);
  });
});
