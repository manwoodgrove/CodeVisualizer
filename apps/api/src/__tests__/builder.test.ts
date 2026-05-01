import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGraph } from '../services/graph/builder.js';
import type { ParseResult, RawNode, RawEdge } from '../services/parser/js-ts-parser.js';

let idCounter = 0;
vi.mock('nanoid', () => ({
  nanoid: () => `id-${idCounter++}`,
}));

describe('buildGraph', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('handles empty input', () => {
    const result = buildGraph([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('converts RawNode to GraphNode with generated ID', () => {
    const rawNode: RawNode = {
      localId: 'local-1',
      kind: 'FUNCTION',
      name: 'testFunc',
      filePath: 'src/test.ts',
      exported: true,
      lineStart: 1,
      lineEnd: 10,
      linesOfCode: 10,
      cyclomaticComplexity: 2,
    };

    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [rawNode],
      edges: [],
      importMap: {},
    };

    const { nodes } = buildGraph([parseResult]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      id: 'id-0',
      kind: 'FUNCTION',
      name: 'testFunc',
      filePath: 'src/test.ts',
      exported: true,
      lineStart: 1,
      lineEnd: 10,
      clusterId: null,
      metrics: {
        linesOfCode: 10,
        cyclomaticComplexity: 2,
        inDegree: 0,
        outDegree: 0,
      },
      position3d: { x: 0, y: 0, z: 0 },
    });
  });

  it('maps edges to correct node IDs and target properties', () => {
    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [
        {
          localId: 'local-1',
          kind: 'FUNCTION',
          name: 'func1',
          filePath: 'src/test.ts',
          exported: false,
          lineStart: 1,
          lineEnd: 2,
          linesOfCode: 2,
          cyclomaticComplexity: 1,
        },
      ],
      edges: [
        {
          sourceLocalId: 'local-1',
          targetName: 'func2',
          targetFilePath: 'src/other.ts',
          kind: 'CALL',
          weight: 1,
        },
      ],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      id: 'id-1',
      source: 'id-0',
      target: 'src/other.ts', // uses targetFilePath when available
      kind: 'CALL',
      weight: 1,
      resolved: false,
    });
  });

  it('uses targetName for target if targetFilePath is missing', () => {
    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [
        {
          localId: 'local-1',
          kind: 'FUNCTION',
          name: 'func1',
          filePath: 'src/test.ts',
          exported: false,
          lineStart: 1,
          lineEnd: 2,
          linesOfCode: 2,
          cyclomaticComplexity: 1,
        },
      ],
      edges: [
        {
          sourceLocalId: 'local-1',
          targetName: 'unknownFunc',
          kind: 'CALL',
          weight: 1,
        },
      ],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe('unknownFunc');
  });

  it('ignores edges with unknown sourceLocalId', () => {
    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [],
      edges: [
        {
          sourceLocalId: 'missing-local',
          targetName: 'func2',
          kind: 'CALL',
          weight: 1,
        },
      ],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);
    expect(edges).toHaveLength(0);
  });

  it('merges duplicate IMPORT edges by summing weight', () => {
    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [
        {
          localId: 'local-1',
          kind: 'MODULE',
          name: 'mod1',
          filePath: 'src/test.ts',
          exported: false,
          lineStart: 1,
          lineEnd: 2,
          linesOfCode: 2,
          cyclomaticComplexity: 1,
        },
      ],
      edges: [
        {
          sourceLocalId: 'local-1',
          targetName: 'mod2',
          targetFilePath: 'src/other.ts',
          kind: 'IMPORT',
          weight: 1,
        },
        {
          sourceLocalId: 'local-1',
          targetName: 'mod2',
          targetFilePath: 'src/other.ts',
          kind: 'IMPORT',
          weight: 2,
        },
      ],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(3);
    expect(edges[0].kind).toBe('IMPORT');
  });

  it('deduplicates non-IMPORT edges without summing weight', () => {
    const parseResult: ParseResult = {
      filePath: 'src/test.ts',
      nodes: [
        {
          localId: 'local-1',
          kind: 'FUNCTION',
          name: 'func1',
          filePath: 'src/test.ts',
          exported: false,
          lineStart: 1,
          lineEnd: 2,
          linesOfCode: 2,
          cyclomaticComplexity: 1,
        },
      ],
      edges: [
        {
          sourceLocalId: 'local-1',
          targetName: 'func2',
          kind: 'CALL',
          weight: 1,
        },
        {
          sourceLocalId: 'local-1',
          targetName: 'func2',
          kind: 'CALL',
          weight: 5, // Duplicate edge with different weight
        },
      ],
      importMap: {},
    };

    const { edges } = buildGraph([parseResult]);

    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(1); // the first edge was kept, the second duplicate was ignored
  });
});
