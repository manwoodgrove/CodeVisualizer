import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../services/graph/layout.js';
import type { GraphNode, GraphEdge, GraphCluster } from '@cv/types';

describe('layoutGraph', () => {
  it('should return empty array when nodes is empty', () => {
    const result = layoutGraph([], [], []);
    expect(result).toEqual([]);
  });

  it('should compute positions for nodes and centroids for clusters', () => {
    const nodes: GraphNode[] = [
      { id: '1', name: 'Node 1', kind: 'CLASS', clusterId: 'c1', path: 'file1' },
      { id: '2', name: 'Node 2', kind: 'FUNCTION', clusterId: 'c1', path: 'file1' },
      { id: '3', name: 'Node 3', kind: 'VARIABLE', clusterId: 'c2', path: 'file2' },
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: '1', target: '2', type: 'CALLS' },
      { id: 'e2', source: '2', target: '3', type: 'USES' },
    ];
    const clusters: GraphCluster[] = [
      { id: 'c1', name: 'Cluster 1', path: 'dir1', size: 2 },
      { id: 'c2', name: 'Cluster 2', path: 'dir2', size: 1 },
    ];

    const result = layoutGraph(nodes, edges, clusters);

    expect(result).toHaveLength(3);

    // Check nodes have positions
    for (const node of result) {
      expect(node).toHaveProperty('position3d');
      expect(node.position3d).toHaveProperty('x');
      expect(typeof node.position3d.x).toBe('number');
      expect(node.position3d).toHaveProperty('y');
      expect(typeof node.position3d.y).toBe('number');
      expect(node.position3d).toHaveProperty('z');
      expect(typeof node.position3d.z).toBe('number');
    }

    // Check specific Z values based on kind
    const node1 = result.find(n => n.id === '1');
    expect(node1?.position3d.z).toBe(0); // CLASS

    const node2 = result.find(n => n.id === '2');
    expect(node2?.position3d.z).toBe(20); // FUNCTION

    const node3 = result.find(n => n.id === '3');
    expect(node3?.position3d.z).toBe(10); // VARIABLE

    // Check clusters have centroids
    for (const cluster of clusters) {
      expect(cluster).toHaveProperty('centroid3d');
      expect(cluster.centroid3d).toHaveProperty('x');
      expect(cluster.centroid3d).toHaveProperty('y');
      expect(cluster.centroid3d).toHaveProperty('z');
    }
  });

  it('should ignore duplicate edges and self-loops', () => {
    const nodes: GraphNode[] = [
      { id: '1', name: 'Node 1', kind: 'CLASS', path: 'file1' },
      { id: '2', name: 'Node 2', kind: 'CLASS', path: 'file2' },
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: '1', target: '2', type: 'CALLS' },
      { id: 'e2', source: '1', target: '2', type: 'CALLS' }, // duplicate
      { id: 'e3', source: '1', target: '1', type: 'CALLS' }, // self-loop
    ];

    // Should not throw
    const result = layoutGraph(nodes, edges, []);
    expect(result).toHaveLength(2);
  });
});
