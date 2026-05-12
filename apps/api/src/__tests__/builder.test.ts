import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGraph } from '../services/graph/builder.js';
import type { ParseResult } from '../services/parser/js-ts-parser.js';

const mocks = vi.hoisted(() => ({
  counter: 0
}));

vi.mock('nanoid', () => ({
  nanoid: () => `global-id-${++mocks.counter}`
}));

describe('buildGraph', () => {
  beforeEach(() => {
    mocks.counter = 0;
  });

  it('converts RawNode to GraphNode and initializes default metrics', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [
          {
            localId: 'local-1',
            kind: 'FUNCTION',
            name: 'main',
            filePath: 'src/main.ts',
            exported: true,
            lineStart: 1,
            lineEnd: 5,
            linesOfCode: 5,
            cyclomaticComplexity: 2,
          }
        ],
        edges: []
      }
    ];

    const { nodes, edges } = buildGraph(parseResults);

    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);

    const node = nodes[0];
    expect(node.id).toBe('global-id-1');
    expect(node.kind).toBe('FUNCTION');
    expect(node.name).toBe('main');
    expect(node.filePath).toBe('src/main.ts');
    expect(node.exported).toBe(true);
    expect(node.lineStart).toBe(1);
    expect(node.lineEnd).toBe(5);
    expect(node.clusterId).toBeNull();
    expect(node.metrics).toEqual({
      linesOfCode: 5,
      cyclomaticComplexity: 2,
      inDegree: 0,
      outDegree: 0,
    });
    expect(node.position3d).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('builds edges and maps source local IDs to global IDs', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [
          { localId: 'local-1', kind: 'FUNCTION', name: 'main', filePath: 'src/main.ts', exported: true, lineStart: 1, lineEnd: 5, linesOfCode: 5, cyclomaticComplexity: 2 }
        ],
        edges: [
          { sourceLocalId: 'local-1', targetName: 'helper', kind: 'CALL', weight: 1 }
        ]
      }
    ];

    const { nodes, edges } = buildGraph(parseResults);

    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(1);

    const edge = edges[0];
    expect(edge.id).toBe('global-id-2'); // 1 for node, 1 for edge
    expect(edge.source).toBe('global-id-1');
    expect(edge.target).toBe('helper');
    expect(edge.kind).toBe('CALL');
    expect(edge.weight).toBe(1);
    expect(edge.resolved).toBe(false);
  });

  it('deduplicates IMPORT edges by summing their weights', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [
          { localId: 'local-1', kind: 'MODULE', name: 'module', filePath: 'src/main.ts', exported: true, lineStart: 1, lineEnd: 5, linesOfCode: 5, cyclomaticComplexity: 1 }
        ],
        edges: [
          { sourceLocalId: 'local-1', targetName: 'fs', kind: 'IMPORT', weight: 1 },
          { sourceLocalId: 'local-1', targetName: 'fs', kind: 'IMPORT', weight: 1 }, // Duplicate
          { sourceLocalId: 'local-1', targetName: 'path', kind: 'IMPORT', weight: 1 } // Different target
        ]
      }
    ];

    const { edges } = buildGraph(parseResults);

    expect(edges).toHaveLength(2);

    const fsEdge = edges.find(e => e.target === 'fs');
    expect(fsEdge).toBeDefined();
    expect(fsEdge?.weight).toBe(2);

    const pathEdge = edges.find(e => e.target === 'path');
    expect(pathEdge).toBeDefined();
    expect(pathEdge?.weight).toBe(1);
  });

  it('ignores edges with unknown sourceLocalId', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [],
        edges: [
          { sourceLocalId: 'unknown-local', targetName: 'helper', kind: 'CALL', weight: 1 }
        ]
      }
    ];

    const { edges } = buildGraph(parseResults);

    expect(edges).toHaveLength(0);
  });

  it('deduplicates non-IMPORT edges without summing weights', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [
          { localId: 'local-1', kind: 'FUNCTION', name: 'main', filePath: 'src/main.ts', exported: true, lineStart: 1, lineEnd: 5, linesOfCode: 5, cyclomaticComplexity: 1 }
        ],
        edges: [
          { sourceLocalId: 'local-1', targetName: 'helper', kind: 'CALL', weight: 1 },
          { sourceLocalId: 'local-1', targetName: 'helper', kind: 'CALL', weight: 1 } // Duplicate
        ]
      }
    ];

    const { edges } = buildGraph(parseResults);

    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(1);
  });

  it('uses targetFilePath over targetName for target reference when provided', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/main.ts',
        importMap: {},
        nodes: [
          { localId: 'local-1', kind: 'FUNCTION', name: 'main', filePath: 'src/main.ts', exported: true, lineStart: 1, lineEnd: 5, linesOfCode: 5, cyclomaticComplexity: 1 }
        ],
        edges: [
          { sourceLocalId: 'local-1', targetName: 'helper', targetFilePath: 'src/helper.ts', kind: 'CALL', weight: 1 }
        ]
      }
    ];

    const { edges } = buildGraph(parseResults);

    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe('src/helper.ts');
  });
});
