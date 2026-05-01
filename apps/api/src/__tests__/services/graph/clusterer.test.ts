import { describe, it, expect, vi } from 'vitest';
import { clusterGraph } from '../../../services/graph/clusterer.js';
import type { GraphNode, GraphEdge } from '@cv/types';
import Graph from 'graphology';

describe('clusterGraph', () => {
  it('ignores duplicate edges in undirected graph without throwing', () => {
    const nodes: GraphNode[] = [
      {
        id: '1', name: 'Node1', kind: 'CLASS', filePath: 'a.ts', exported: false,
        lineStart: 1, lineEnd: 10, clusterId: null, metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 1 }, position3d: { x: 0, y: 0, z: 0 }
      },
      {
        id: '2', name: 'Node2', kind: 'CLASS', filePath: 'b.ts', exported: false,
        lineStart: 1, lineEnd: 10, clusterId: null, metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 1, outDegree: 0 }, position3d: { x: 0, y: 0, z: 0 }
      },
    ];

    const edges: GraphEdge[] = [
      { id: 'e1', source: '1', target: '2', kind: 'CALL', weight: 1, resolved: true },
    ];

    const addEdgeSpy = vi.spyOn(Graph.prototype, 'addEdge').mockImplementationOnce(() => {
      throw new Error('Graph.addEdge: an edge already exists');
    });

    const result = clusterGraph(nodes, edges);

    // It should just ignore the error and successfully return nodes With Clusters
    expect(result.nodesWithClusters.length).toBe(2);
    expect(addEdgeSpy).toHaveBeenCalledWith('1', '2');

    addEdgeSpy.mockRestore();
  });
});
