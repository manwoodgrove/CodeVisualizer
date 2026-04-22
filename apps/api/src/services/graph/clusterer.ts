import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { GraphNode, GraphEdge, GraphCluster } from '@codevisualizer/types';

const CLUSTER_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#14B8A6', '#6366F1',
];

export function clusterNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; clusters: GraphCluster[] } {
  const g = new Graph({ type: 'directed', multi: false });

  for (const node of nodes) {
    g.addNode(node.id, { kind: node.kind });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
      g.addEdge(edge.source, edge.target);
    }
  }

  let communities: Record<string, number>;
  try {
    // louvain may be default-exported or directly the function depending on module format
    const fn = typeof louvain === 'function' ? louvain : (louvain as unknown as { default: typeof louvain }).default;
    communities = fn(g) as Record<string, number>;
  } catch {
    communities = Object.fromEntries(nodes.map(n => [n.id, 0]));
  }

  const communityGroups = new Map<number, string[]>();
  for (const [nodeId, communityId] of Object.entries(communities)) {
    const arr = communityGroups.get(Number(communityId)) ?? [];
    arr.push(nodeId);
    communityGroups.set(Number(communityId), arr);
  }

  const clusters: GraphCluster[] = [];
  const clusterIdByNodeId = new Map<string, string>();

  let idx = 0;
  for (const [communityId, nodeIds] of communityGroups) {
    const clusterId = `cluster-${communityId}`;
    const color = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
    idx++;

    const paths = nodeIds
      .map(id => nodes.find(n => n.id === id)?.filePath ?? '')
      .map(p => p.split('/').slice(0, -1).join('/') || 'root');
    const label = mostCommon(paths) || `Cluster ${communityId}`;

    clusters.push({ id: clusterId, label, color, nodeIds, centroid3d: { x: 0, y: 0, z: 0 } });
    for (const nid of nodeIds) clusterIdByNodeId.set(nid, clusterId);
  }

  const updatedNodes = nodes.map(n => ({
    ...n,
    clusterId: clusterIdByNodeId.get(n.id) ?? 'cluster-0',
  }));

  return { nodes: updatedNodes, clusters };
}

function mostCommon(arr: string[]): string {
  const freq = new Map<string, number>();
  for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
  let max = 0, best = '';
  for (const [v, c] of freq) { if (c > max) { max = c; best = v; } }
  return best;
}
