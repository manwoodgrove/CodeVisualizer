import { describe, it, expect } from 'vitest';
import { buildGraph } from '../services/graph/builder.js';
import type { ParseResult, RawNode, RawEdge } from '../services/parser/js-ts-parser.js';
import type { NodeKind, EdgeKind } from '@cv/types';

describe('buildGraph edge deduplication', () => {
  const createMockNode = (id: string, kind: NodeKind = 'MODULE'): RawNode => ({
    localId: id,
    kind,
    name: `node_${id}`,
    filePath: `file_${id}.ts`,
    exported: true,
    lineStart: 1,
    lineEnd: 10,
    linesOfCode: 10,
    cyclomaticComplexity: 1,
  });

  const createMockEdge = (
    sourceId: string,
    targetName: string,
    kind: EdgeKind,
    weight: number = 1,
    targetFilePath?: string
  ): RawEdge => ({
    sourceLocalId: sourceId,
    targetName,
    kind,
    weight,
    targetFilePath,
  });

  it('merges IMPORT edges between the same source and target by summing their weights', () => {
    const nodeA = createMockNode('moduleA');

    const edge1 = createMockEdge('moduleA', 'moduleB', 'IMPORT', 2, 'file_moduleB.ts');
    const edge2 = createMockEdge('moduleA', 'moduleB', 'IMPORT', 3, 'file_moduleB.ts');

    const parseResult: ParseResult = {
      filePath: 'file_moduleA.ts',
      nodes: [nodeA],
      edges: [edge1, edge2],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe('IMPORT');
    expect(edges[0].weight).toBe(5); // 2 + 3 = 5
    expect(edges[0].target).toBe('file_moduleB.ts');
  });

  it('ignores duplicate non-IMPORT edges', () => {
    const nodeA = createMockNode('funcA', 'FUNCTION');

    // CALL edges are not IMPORT edges, so they should be deduplicated (first one kept, rest ignored)
    const edge1 = createMockEdge('funcA', 'funcB', 'CALL', 1, undefined);
    const edge2 = createMockEdge('funcA', 'funcB', 'CALL', 5, undefined);

    const parseResult: ParseResult = {
      filePath: 'file_funcA.ts',
      nodes: [nodeA],
      edges: [edge1, edge2],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe('CALL');
    expect(edges[0].weight).toBe(1); // Keeps the first edge's weight
    expect(edges[0].target).toBe('funcB');
  });

  it('keeps edges of different kinds separate even if source and target match', () => {
    const nodeA = createMockNode('moduleA', 'MODULE');

    const importEdge = createMockEdge('moduleA', 'moduleB', 'IMPORT', 1, 'file_moduleB.ts');
    const callEdge = createMockEdge('moduleA', 'moduleB', 'CALL', 1, 'file_moduleB.ts');

    const parseResult: ParseResult = {
      filePath: 'file_moduleA.ts',
      nodes: [nodeA],
      edges: [importEdge, callEdge],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(2);

    const importResult = edges.find(e => e.kind === 'IMPORT');
    const callResult = edges.find(e => e.kind === 'CALL');

    expect(importResult).toBeDefined();
    expect(callResult).toBeDefined();
  });

  it('resolves targetRef properly, falling back to targetName if targetFilePath is missing', () => {
    const nodeA = createMockNode('moduleA');

    const edgeWithFilePath = createMockEdge('moduleA', 'target1', 'IMPORT', 1, 'path/to/target1.ts');
    const edgeWithoutFilePath = createMockEdge('moduleA', 'target2', 'IMPORT', 1, undefined);

    const parseResult: ParseResult = {
      filePath: 'file_moduleA.ts',
      nodes: [nodeA],
      edges: [edgeWithFilePath, edgeWithoutFilePath],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(2);

    const edge1 = edges.find(e => e.target === 'path/to/target1.ts');
    const edge2 = edges.find(e => e.target === 'target2');

    expect(edge1).toBeDefined();
    expect(edge2).toBeDefined();
  });

  it('skips edges if the source node is not found in the parse results', () => {
    const edge = createMockEdge('unknownSource', 'target', 'IMPORT', 1);

    const parseResult: ParseResult = {
      filePath: 'file.ts',
      nodes: [], // No nodes provided
      edges: [edge],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(0);
  });
});
