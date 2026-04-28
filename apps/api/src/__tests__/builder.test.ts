import { describe, it, expect } from 'vitest';
import { buildGraph } from '../services/graph/builder.js';
import type { ParseResult } from '../services/parser/js-ts-parser.js';

describe('buildGraph', () => {
  it('builds a graph from a single parse result', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/index.ts',
        importMap: {},
        nodes: [
          {
            localId: 'MODULE:src/index.ts:1:index',
            kind: 'MODULE',
            name: 'index',
            filePath: 'src/index.ts',
            exported: true,
            lineStart: 1,
            lineEnd: 10,
            linesOfCode: 10,
            cyclomaticComplexity: 1,
          },
          {
            localId: 'FUNCTION:src/index.ts:2:main',
            kind: 'FUNCTION',
            name: 'main',
            filePath: 'src/index.ts',
            exported: false,
            lineStart: 2,
            lineEnd: 5,
            linesOfCode: 4,
            cyclomaticComplexity: 2,
          },
        ],
        edges: [
          {
            sourceLocalId: 'FUNCTION:src/index.ts:2:main',
            targetName: 'utils',
            targetFilePath: 'src/utils.ts',
            kind: 'IMPORT',
            weight: 1,
          },
        ],
      },
    ];

    const result = buildGraph(parseResults);

    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0].name).toBe('index');
    expect(result.nodes[0].metrics.cyclomaticComplexity).toBe(1);
    expect(result.nodes[1].name).toBe('main');
    expect(result.nodes[1].metrics.cyclomaticComplexity).toBe(2);

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].kind).toBe('IMPORT');
    expect(result.edges[0].weight).toBe(1);
    expect(result.edges[0].target).toBe('src/utils.ts');
  });

  it('merges duplicate IMPORT edges by summing weight', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/index.ts',
        importMap: {},
        nodes: [
          {
            localId: 'FUNCTION:src/index.ts:2:main',
            kind: 'FUNCTION',
            name: 'main',
            filePath: 'src/index.ts',
            exported: false,
            lineStart: 2,
            lineEnd: 5,
            linesOfCode: 4,
            cyclomaticComplexity: 1,
          },
        ],
        edges: [
          {
            sourceLocalId: 'FUNCTION:src/index.ts:2:main',
            targetName: 'utils',
            targetFilePath: 'src/utils.ts',
            kind: 'IMPORT',
            weight: 1,
          },
          {
            sourceLocalId: 'FUNCTION:src/index.ts:2:main',
            targetName: 'utils',
            targetFilePath: 'src/utils.ts',
            kind: 'IMPORT',
            weight: 2,
          },
          {
            sourceLocalId: 'FUNCTION:src/index.ts:2:main',
            targetName: 'utils',
            targetFilePath: 'src/utils.ts',
            kind: 'CALL',
            weight: 1,
          },
        ],
      },
    ];

    const result = buildGraph(parseResults);

    expect(result.edges.length).toBe(2);

    const importEdge = result.edges.find((e) => e.kind === 'IMPORT');
    expect(importEdge).toBeDefined();
    expect(importEdge?.weight).toBe(3); // 1 + 2

    const callEdge = result.edges.find((e) => e.kind === 'CALL');
    expect(callEdge).toBeDefined();
    expect(callEdge?.weight).toBe(1);
  });

  it('handles missing source references correctly by ignoring the edge', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/index.ts',
        importMap: {},
        nodes: [],
        edges: [
          {
            sourceLocalId: 'MISSING:src/index.ts:2:main',
            targetName: 'utils',
            kind: 'IMPORT',
            weight: 1,
          },
        ],
      },
    ];

    const result = buildGraph(parseResults);
    expect(result.edges.length).toBe(0);
  });

  it('builds a graph from multiple parse results correctly', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/index.ts',
        importMap: {},
        nodes: [
          {
            localId: 'MODULE:src/index.ts:1:index',
            kind: 'MODULE',
            name: 'index',
            filePath: 'src/index.ts',
            exported: true,
            lineStart: 1,
            lineEnd: 10,
            linesOfCode: 10,
            cyclomaticComplexity: 1,
          },
        ],
        edges: [
          {
            sourceLocalId: 'MODULE:src/index.ts:1:index',
            targetName: 'helper',
            targetFilePath: 'src/helper.ts',
            kind: 'IMPORT',
            weight: 1,
          },
        ],
      },
      {
        filePath: 'src/helper.ts',
        importMap: {},
        nodes: [
          {
            localId: 'MODULE:src/helper.ts:1:helper',
            kind: 'MODULE',
            name: 'helper',
            filePath: 'src/helper.ts',
            exported: true,
            lineStart: 1,
            lineEnd: 5,
            linesOfCode: 5,
            cyclomaticComplexity: 1,
          },
        ],
        edges: [],
      },
    ];

    const result = buildGraph(parseResults);

    expect(result.nodes.length).toBe(2);
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('index');
    expect(nodeNames).toContain('helper');

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].target).toBe('src/helper.ts');
  });

  it('uses targetName as target if targetFilePath is missing', () => {
    const parseResults: ParseResult[] = [
      {
        filePath: 'src/index.ts',
        importMap: {},
        nodes: [
          {
            localId: 'FUNCTION:src/index.ts:1:main',
            kind: 'FUNCTION',
            name: 'main',
            filePath: 'src/index.ts',
            exported: true,
            lineStart: 1,
            lineEnd: 10,
            linesOfCode: 10,
            cyclomaticComplexity: 1,
          },
        ],
        edges: [
          {
            sourceLocalId: 'FUNCTION:src/index.ts:1:main',
            targetName: 'fs',
            kind: 'IMPORT',
            weight: 1,
          },
        ],
      },
    ];

    const result = buildGraph(parseResults);

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].target).toBe('fs');
  });
});
