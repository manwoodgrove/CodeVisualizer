import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { GraphNode, GraphEdge, GraphCluster } from '@cv/types';

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusters: GraphCluster[],
): GraphNode[] {
  if (nodes.length === 0) return nodes;

  const graph = new Graph({ type: 'mixed', multi: false });

  // Build cluster index map
  const clusterIndexMap = new Map<string, number>();
  for (let i = 0; i < clusters.length; i++) {
    clusterIndexMap.set(clusters[i].id, i);
  }

  // Add nodes with initial random positions
  for (const n of nodes) {
    if (!graph.hasNode(n.id)) {
      graph.addNode(n.id, {
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100,
      });
    }
  }

  // Add edges
  for (const e of edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    if (e.source === e.target) continue;
    try {
      graph.addEdge(e.source, e.target);
    } catch {
      // ignore duplicate edges
    }
  }

  // Run ForceAtlas2
  forceAtlas2.assign(graph, {
    iterations: 300,
    settings: {
      gravity: 1,
      scalingRatio: 10,
      strongGravityMode: false,
      slowDown: 2,
    },
  });

  // Extract positions and assign z from cluster index
  const layoutNodes = nodes.map((n) => {
    const attrs = graph.getNodeAttributes(n.id) as { x: number; y: number };
    const clusterIndex = n.clusterId !== null ? (clusterIndexMap.get(n.clusterId) ?? 0) : 0;
    const z = clusterIndex * 30 + (Math.random() - 0.5) * 4;
    return {
      ...n,
      position3d: { x: attrs.x, y: attrs.y, z },
    };
  });

  // Compute cluster centroids
  const clusterPositions = new Map<string, { xs: number[]; ys: number[]; zs: number[] }>();
  for (const n of layoutNodes) {
    if (!n.clusterId) continue;
    const entry = clusterPositions.get(n.clusterId) ?? { xs: [], ys: [], zs: [] };
    entry.xs.push(n.position3d.x);
    entry.ys.push(n.position3d.y);
    entry.zs.push(n.position3d.z);
    clusterPositions.set(n.clusterId, entry);
  }

  for (const cluster of clusters) {
    const pos = clusterPositions.get(cluster.id);
    if (!pos || pos.xs.length === 0) continue;
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    cluster.centroid3d = {
      x: avg(pos.xs),
      y: avg(pos.ys),
      z: avg(pos.zs),
    };
  }

  return layoutNodes;
}
