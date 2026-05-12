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
      gravity: 5,
      scalingRatio: 2,
      strongGravityMode: false,
      slowDown: 2,
    },
  });

  // Extract positions and assign z from node kind
  const layoutNodes = nodes.map((n) => {
    const attrs = graph.getNodeAttributes(n.id) as { x: number; y: number };

    let z = 0;
    if (n.kind === 'FUNCTION' || n.kind === 'METHOD') {
      z = 20;
    } else if (n.kind === 'VARIABLE') {
      z = 10;
    }

    return {
      ...n,
      position3d: { x: attrs.x, y: attrs.y, z },
    };
  });

  // Compute cluster centroids
  const clusterSums = new Map<string, { x: number; y: number; z: number; count: number }>();
  for (const n of layoutNodes) {
    if (!n.clusterId) continue;
    let entry = clusterSums.get(n.clusterId);
    if (!entry) {
      entry = { x: 0, y: 0, z: 0, count: 0 };
      clusterSums.set(n.clusterId, entry);
    }
    entry.x += n.position3d.x;
    entry.y += n.position3d.y;
    entry.z += n.position3d.z;
    entry.count++;
  }

  for (const cluster of clusters) {
    const sum = clusterSums.get(cluster.id);
    if (!sum || sum.count === 0) continue;
    cluster.centroid3d = {
      x: sum.x / sum.count,
      y: sum.y / sum.count,
      z: sum.z / sum.count,
    };
  }

  return layoutNodes;
}
