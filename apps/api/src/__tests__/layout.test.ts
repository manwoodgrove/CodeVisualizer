import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../services/graph/layout.js';
import type { GraphNode, GraphEdge, GraphCluster } from '@cv/types';

describe('layoutGraph', () => {
  it('should ignore duplicate edges when building the graph', () => {
    const nodes: GraphNode[] = [
      {
        id: 'A',
        kind: 'FUNCTION',
        name: 'A',
        filePath: 'a.ts',
        exported: true,
        lineStart: 1,
        lineEnd: 2,
        clusterId: null,
        metrics: { linesOfCode: 1, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
        position3d: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'B',
        kind: 'FUNCTION',
        name: 'B',
        filePath: 'b.ts',
        exported: true,
        lineStart: 1,
        lineEnd: 2,
        clusterId: null,
        metrics: { linesOfCode: 1, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
        position3d: { x: 0, y: 0, z: 0 },
      },
    ];

    const edges: GraphEdge[] = [
      { id: '1', source: 'A', target: 'B', kind: 'CALL', weight: 1, resolved: true },
      { id: '2', source: 'A', target: 'B', kind: 'CALL', weight: 1, resolved: true }, // Duplicate edge
    ];

    const clusters: GraphCluster[] = [];

    // If duplicate edge is not caught, it will throw Error: "Graph.addEdge: an edge linking "A" to "B" already exists."
    // By wrapping in try/catch in layoutGraph, it shouldn't throw an error.
    let resultNodes;
    expect(() => {
      resultNodes = layoutGraph(nodes, edges, clusters);
    }).not.toThrow();

    expect(resultNodes).toBeDefined();
    expect(resultNodes?.length).toBe(2);
    // The forceAtlas2 layout should have assigned coordinates and our extract logic assigned z = 20
    expect(resultNodes?.[0].position3d.z).toBe(20);
    expect(resultNodes?.[1].position3d.z).toBe(20);
  });
});
