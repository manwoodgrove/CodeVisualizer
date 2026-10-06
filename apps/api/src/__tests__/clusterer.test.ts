import { describe, it, expect } from 'vitest';
import { clusterGraph } from '../services/graph/clusterer.js';
import type { GraphNode, GraphEdge } from '@cv/types';

function createMockNode(id: string, filePath: string): GraphNode {
  return {
    id,
    kind: 'FUNCTION',
    name: id,
    filePath,
    exported: false,
    lineStart: 1,
    lineEnd: 10,
    clusterId: null,
    metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
    position3d: { x: 0, y: 0, z: 0 },
  };
}

describe('clusterGraph', () => {
  it('should cluster two disjoint components into separate clusters', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'src/compA/file1.ts'),
      createMockNode('n2', 'src/compA/file2.ts'),
      createMockNode('n3', 'src/compB/file1.ts'),
      createMockNode('n4', 'src/compB/file2.ts'),
    ];

    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e2', source: 'n3', target: 'n4', kind: 'IMPORT', weight: 1, resolved: true },
    ];

    const result = clusterGraph(nodes, edges);

    expect(result.clusters.length).toBe(2);
    expect(result.nodesWithClusters.length).toBe(4);

    const n1Cluster = result.nodesWithClusters.find(n => n.id === 'n1')?.clusterId;
    const n2Cluster = result.nodesWithClusters.find(n => n.id === 'n2')?.clusterId;
    const n3Cluster = result.nodesWithClusters.find(n => n.id === 'n3')?.clusterId;
    const n4Cluster = result.nodesWithClusters.find(n => n.id === 'n4')?.clusterId;

    expect(n1Cluster).toBe(n2Cluster);
    expect(n3Cluster).toBe(n4Cluster);
    expect(n1Cluster).not.toBe(n3Cluster);

    const clusterLabels = result.clusters.map(c => c.label);
    expect(clusterLabels).toContain('compA');
    expect(clusterLabels).toContain('compB');
  });

  it('should ignore edges that are not IMPORT or CALL', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'src/comp/file1.ts'),
      createMockNode('n2', 'src/comp/file2.ts'),
      createMockNode('n3', 'src/comp/file3.ts'),
    ];

    const edges: GraphEdge[] = [
      // Only one CALL edge, so n1 and n2 might cluster together, but n3 should be isolated
      { id: 'e1', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e2', source: 'n2', target: 'n3', kind: 'DATA_FLOW', weight: 1, resolved: true },
      { id: 'e3', source: 'n1', target: 'n3', kind: 'INHERITANCE', weight: 1, resolved: true },
    ];

    const result = clusterGraph(nodes, edges);

    // Because 'DATA_FLOW' and 'INHERITANCE' are ignored, n3 is disconnected.
    // That means n1 and n2 might be in one cluster, and n3 in another.
    const n1Cluster = result.nodesWithClusters.find(n => n.id === 'n1')?.clusterId;
    const n2Cluster = result.nodesWithClusters.find(n => n.id === 'n2')?.clusterId;
    const n3Cluster = result.nodesWithClusters.find(n => n.id === 'n3')?.clusterId;

    expect(n1Cluster).toBe(n2Cluster);
    expect(n1Cluster).not.toBe(n3Cluster);
    expect(result.clusters.length).toBe(2);
  });

  it('should correctly determine dominant directory label', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'src/dominant/file1.ts'),
      createMockNode('n2', 'src/dominant/file2.ts'),
      createMockNode('n3', 'src/dominant/file3.ts'),
      createMockNode('n4', 'src/minority/file1.ts'),
    ];

    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e2', source: 'n1', target: 'n3', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e3', source: 'n1', target: 'n4', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e4', source: 'n2', target: 'n3', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e5', source: 'n2', target: 'n4', kind: 'CALL', weight: 1, resolved: true },
      { id: 'e6', source: 'n3', target: 'n4', kind: 'CALL', weight: 1, resolved: true },
    ];

    const result = clusterGraph(nodes, edges);

    // Fully connected clique (n1,n2,n3,n4) should form one single component
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].label).toBe('dominant');
  });

  it('should handle empty graphs gracefully', () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const result = clusterGraph(nodes, edges);

    expect(result.clusters).toEqual([]);
    expect(result.nodesWithClusters).toEqual([]);
  });

  it('should assign disconnected nodes to their own clusters', () => {
    const nodes: GraphNode[] = [
      createMockNode('n1', 'src/alone1.ts'),
      createMockNode('n2', 'src/alone2.ts'),
      createMockNode('n3', 'src/alone3.ts'),
    ];
    const edges: GraphEdge[] = [];

    const result = clusterGraph(nodes, edges);

    expect(result.clusters.length).toBe(3);
    const clusterIds = result.nodesWithClusters.map(n => n.clusterId);
    expect(new Set(clusterIds).size).toBe(3); // All distinct

    // Check dominant labels: when no directory is present, parts[0] is used.
    const clusterLabels = result.clusters.map(c => c.label);
    expect(clusterLabels).toContain('src');
  });
});
