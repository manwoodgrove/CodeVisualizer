import { describe, it, expect, vi } from 'vitest';
import { layoutGraph } from '../services/graph/layout.js';
import type { GraphNode, GraphEdge, GraphCluster } from '@cv/types';
import Graph from 'graphology';

// Mock the forceAtlas2 library to be deterministic and fast
vi.mock('graphology-layout-forceatlas2', () => {
  return {
    default: {
      assign: vi.fn((graph: Graph, options: any) => {
        // Just set deterministic coordinates for testing
        let i = 0;
        graph.forEachNode((node, attrs) => {
          graph.setNodeAttribute(node, 'x', i * 10);
          graph.setNodeAttribute(node, 'y', i * 10);
          i++;
        });
      })
    }
  };
});

describe('layoutGraph', () => {
  it('should return empty array when nodes are empty', () => {
    expect(layoutGraph([], [], [])).toEqual([]);
  });

  it('should assign 3D positions to nodes based on kind and mocked layout', () => {
    const nodes: GraphNode[] = [
      { id: 'n1', kind: 'FUNCTION', name: 'func1', filePath: 'file1.ts', exported: true, lineStart: 1, lineEnd: 10, clusterId: 'c1', metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 1 }, position3d: { x: 0, y: 0, z: 0 } },
      { id: 'n2', kind: 'VARIABLE', name: 'var1', filePath: 'file1.ts', exported: true, lineStart: 12, lineEnd: 12, clusterId: 'c1', metrics: { linesOfCode: 1, cyclomaticComplexity: 1, inDegree: 1, outDegree: 0 }, position3d: { x: 0, y: 0, z: 0 } },
      { id: 'n3', kind: 'MODULE', name: 'mod1', filePath: 'file1.ts', exported: true, lineStart: 1, lineEnd: 12, clusterId: 'c2', metrics: { linesOfCode: 12, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 }, position3d: { x: 0, y: 0, z: 0 } }
    ];
    const edges: GraphEdge[] = [{ id: 'e1', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true }];
    const clusters: GraphCluster[] = [
      { id: 'c1', label: 'Cluster 1', color: '#ff0000', nodeIds: ['n1', 'n2'], centroid3d: { x: 0, y: 0, z: 0 } },
      { id: 'c2', label: 'Cluster 2', color: '#00ff00', nodeIds: ['n3'], centroid3d: { x: 0, y: 0, z: 0 } }
    ];

    const result = layoutGraph(nodes, edges, clusters);

    expect(result.length).toBe(3);

    // n1 should be at (0, 0, 20) because FUNCTION -> z=20, i=0
    const n1 = result.find(n => n.id === 'n1')!;
    expect(n1.position3d).toEqual({ x: 0, y: 0, z: 20 });

    // n2 should be at (10, 10, 10) because VARIABLE -> z=10, i=1
    const n2 = result.find(n => n.id === 'n2')!;
    expect(n2.position3d).toEqual({ x: 10, y: 10, z: 10 });

    // n3 should be at (20, 20, 0) because MODULE -> z=0, i=2
    const n3 = result.find(n => n.id === 'n3')!;
    expect(n3.position3d).toEqual({ x: 20, y: 20, z: 0 });

    // Verify cluster centroids
    const c1 = clusters.find(c => c.id === 'c1')!;
    // c1 contains n1 (0,0,20) and n2 (10,10,10) -> centroid (5, 5, 15)
    expect(c1.centroid3d).toEqual({ x: 5, y: 5, z: 15 });

    const c2 = clusters.find(c => c.id === 'c2')!;
    // c2 contains n3 (20,20,0) -> centroid (20, 20, 0)
    expect(c2.centroid3d).toEqual({ x: 20, y: 20, z: 0 });
  });

  it('should ignore edges for missing nodes, self loops, and duplicate edges', () => {
    const nodes: GraphNode[] = [
      { id: 'n1', kind: 'CLASS', name: 'c', filePath: 'f', exported: true, lineStart: 1, lineEnd: 10, clusterId: null, metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 1 }, position3d: { x: 0, y: 0, z: 0 } },
      { id: 'n2', kind: 'CLASS', name: 'c2', filePath: 'f2', exported: true, lineStart: 1, lineEnd: 10, clusterId: null, metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 1 }, position3d: { x: 0, y: 0, z: 0 } }
    ];

    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'nx', kind: 'CALL', weight: 1, resolved: true }, // missing target
      { id: 'e2', source: 'ny', target: 'n2', kind: 'CALL', weight: 1, resolved: true }, // missing source
      { id: 'e3', source: 'n1', target: 'n1', kind: 'CALL', weight: 1, resolved: true }, // self loop
      { id: 'e4', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true }, // valid edge
      { id: 'e5', source: 'n1', target: 'n2', kind: 'CALL', weight: 1, resolved: true }  // duplicate edge
    ];

    const result = layoutGraph(nodes, edges, []);
    expect(result.length).toBe(2);
    // Since edges are internal to the layout computation and we mock layout,
    // we just verify that `layoutGraph` doesn't throw and finishes cleanly.
  });
});
