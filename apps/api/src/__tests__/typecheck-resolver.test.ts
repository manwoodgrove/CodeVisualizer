import { describe, it, expect, vi } from 'vitest';
import * as ts from 'typescript';
import { buildTypeCheckResolver } from '../services/graph/typecheck-resolver.js';

vi.mock('typescript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('typescript')>();
  return {
    ...actual,
    createProgram: () => {
      throw new Error('Simulated failure');
    }
  };
});

describe('buildTypeCheckResolver', () => {
  it('returns a no-op resolver when ts.createProgram throws', () => {
    const resolver = buildTypeCheckResolver({ files: [], nodes: [] });
    expect(resolver).toBeDefined();

    // Ensure that it's the no-op resolver that always returns null
    expect(resolver.resolve('test.ts', 'foo', 10)).toBeNull();
    expect(resolver.resolve('another.ts', 'bar', 42)).toBeNull();
  });
});
