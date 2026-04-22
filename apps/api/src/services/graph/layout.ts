import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { GraphNode, GraphEdge, GraphCluster } from '@codevisualizer/types';

const SCALE = 50;
const CLUSTER_Z_STEP = 40;

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusters: GraphCluster[],
): { nodes: GraphNode[]; clusters: GraphCluster[] } {
  if (nodes.length === 0) return { nodes, clusters };

  const g = new Graph({ type: 'directed', multi: false });

  for (const node of nodes) {
    g.addNode(node.id, {
      x: Math.random() * 100 - 50,
      y: Math.random() * 100 - 50,
    });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
      g.addEdge(edge.source, edge.target);
    }
  }

  try {
    if (typeof forceAtlas2.assign === 'function') {
      forceAtlas2.assign(g, {
        iterations: 200,
        settings: { linLogMode: true, barnesHutOptimize: nodes.length > 100, scalingRatio: 2 },
      });
    } else {
      const positions = forceAtlas2(g, {
        iterations: 200,
        settings: { linLogMode: true, barnesHutOptimize: nodes.length > 100, scalingRatio: 2 },
      });
      for (const [id, pos] of Object.entries(positions)) {
        g.setNodeAttribute(id, 'x', pos.x);
        g.setNodeAttribute(id, 'y', pos.y);
      }
    }
  } catch {
    // Fall back to random positions already seeded above
  }

  const clusterZMap = new Map<string, number>();
  clusters.forEach((c, i) => clusterZMap.set(c.id, i * CLUSTER_Z_STEP));

  const updatedNodes = nodes.map(node => {
    const pos = g.getNodeAttributes(node.id) as { x?: number; y?: number };
    const z = (clusterZMap.get(node.clusterId) ?? 0) + (Math.random() - 0.5) * 10;
    return {
      ...node,
      position3d: {
        x: (pos.x ?? 0) * SCALE,
        y: (pos.y ?? 0) * SCALE,
        z,
      },
    };
  });

  const updatedClusters = clusters.map(cluster => {
    const memberNodes = updatedNodes.filter(n => n.clusterId === cluster.id);
    if (memberNodes.length === 0) return cluster;
    const cx = memberNodes.reduce((s, n) => s + n.position3d.x, 0) / memberNodes.length;
    const cy = memberNodes.reduce((s, n) => s + n.position3d.y, 0) / memberNodes.length;
    const cz = memberNodes.reduce((s, n) => s + n.position3d.z, 0) / memberNodes.length;
    return { ...cluster, centroid3d: { x: cx, y: cy, z: cz } };
  });

  return { nodes: updatedNodes, clusters: updatedClusters };
}
