import { describe, it, expect } from 'vitest';
import { enrichGraph } from '../services/graph/enricher.js';
import type { GraphNode, GraphEdge } from '@cv/types';
import type { FetchedFile } from '../services/github/fetcher.js';

function createMockNode(id: string, name: string, filePath: string): GraphNode {
  return {
    id,
    kind: 'FUNCTION',
    name,
    filePath,
    exported: false,
    lineStart: 1,
    lineEnd: 10,
    clusterId: null,
    metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 99, outDegree: 99 }, // start with non-zero to test reset
    position3d: { x: 0, y: 0, z: 0 },
  };
}

describe('enrichGraph', () => {
  it('should reset and recalculate inDegree and outDegree metrics', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'f1', 'file1.ts'),
      createMockNode('n2', 'f2', 'file2.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', kind: 'IMPORT', weight: 1, resolved: false },
    ];

    const { nodes: enrichedNodes } = enrichGraph(nodes, edges);

    const n1 = enrichedNodes.find(n => n.id === 'n1')!;
    const n2 = enrichedNodes.find(n => n.id === 'n2')!;

    expect(n1.metrics.outDegree).toBe(1);
    expect(n1.metrics.inDegree).toBe(0);
    expect(n2.metrics.outDegree).toBe(0);
    expect(n2.metrics.inDegree).toBe(1);
  });

  it('should resolve CALL edges using same-file preference fallback', () => {
    const nodes: GraphNode[] = [
      createMockNode('source', 'caller', 'fileA.ts'),
      createMockNode('target-same-file', 'callee', 'fileA.ts'),
      createMockNode('target-other-file', 'callee', 'fileB.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'source', target: 'callee', kind: 'CALL', weight: 1, resolved: false },
    ];

    const { edges: enrichedEdges } = enrichGraph(nodes, edges);

    expect(enrichedEdges[0].target).toBe('target-same-file');
    expect(enrichedEdges[0].resolved).toBe(true);
  });

  it('should resolve CALL edges using name fallback when no same-file match', () => {
    const nodes: GraphNode[] = [
      createMockNode('source', 'caller', 'fileA.ts'),
      createMockNode('target-other-file', 'callee', 'fileB.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'source', target: 'callee', kind: 'CALL', weight: 1, resolved: false },
    ];

    const { edges: enrichedEdges } = enrichGraph(nodes, edges);

    expect(enrichedEdges[0].target).toBe('target-other-file');
    expect(enrichedEdges[0].resolved).toBe(true);
  });

  it('should resolve INHERITANCE edges similarly to CALL edges', () => {
    const nodes: GraphNode[] = [
      createMockNode('classA', 'Base', 'fileA.ts'),
      createMockNode('classB', 'Derived', 'fileB.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'classB', target: 'Base', kind: 'INHERITANCE', weight: 1, resolved: false },
    ];

    const { edges: enrichedEdges } = enrichGraph(nodes, edges);

    expect(enrichedEdges[0].target).toBe('classA');
    expect(enrichedEdges[0].resolved).toBe(true);
  });

  it('should handle IMPORT, DATA_FLOW, and EXPORT edges', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'v1', 'file1.ts'),
      createMockNode('n2', 'v2', 'file2.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', kind: 'IMPORT', weight: 1, resolved: false },
      { id: 'e2', source: 'n1', target: 'n2', kind: 'DATA_FLOW', weight: 1, resolved: false },
      { id: 'e3', source: 'n1', target: 'n2', kind: 'EXPORT', weight: 1, resolved: false },
      { id: 'e4', source: 'n1', target: 'unresolved-target', kind: 'IMPORT', weight: 1, resolved: false },
    ];

    const { edges: enrichedEdges } = enrichGraph(nodes, edges);

    expect(enrichedEdges[0].resolved).toBe(true); // target n2 exists
    expect(enrichedEdges[1].resolved).toBe(true); // target n2 exists
    expect(enrichedEdges[2].resolved).toBe(true); // target n2 exists
    expect(enrichedEdges[3].resolved).toBe(false); // target unresolved-target does not exist
  });

  it('should use TypeChecker when files are provided', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'foo', 'a.ts'),
      createMockNode('n2', 'bar', 'b.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n2', target: 'foo', kind: 'CALL', weight: 1, resolved: false },
    ];
    const files: FetchedFile[] = [
      { path: 'a.ts', content: 'export function foo() {}', size: 24 },
      { path: 'b.ts', content: "import { foo } from './a.js';\nexport function bar() { foo(); }", size: 62 },
    ];

    // This test exercises the real typecheck-resolver when run via vitest in a normal environment.
    const { edges: enrichedEdges } = enrichGraph(nodes, edges, files);

    expect(enrichedEdges[0].target).toBe('n1');
    expect(enrichedEdges[0].resolved).toBe(true);
  });

  it('should handle unresolved CALL edges gracefully', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'foo', 'a.ts'),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'nonExistent', kind: 'CALL', weight: 1, resolved: false },
    ];

    const { edges: enrichedEdges } = enrichGraph(nodes, edges);

    expect(enrichedEdges[0].target).toBe('nonExistent');
    expect(enrichedEdges[0].resolved).toBe(false);
  });
});
