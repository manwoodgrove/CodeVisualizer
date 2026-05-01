import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, GraphCluster } from '@cv/types';

const PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
];

export function clusterGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { clusters: GraphCluster[]; nodesWithClusters: GraphNode[] } {
  const graph = new Graph({ type: 'undirected', multi: false });

  // Add all nodes
  for (const n of nodes) {
    if (!graph.hasNode(n.id)) {
      graph.addNode(n.id, { filePath: n.filePath });
    }
  }

  // Add edges for IMPORT and CALL kinds only
  for (const e of edges) {
    if (e.kind !== 'IMPORT' && e.kind !== 'CALL') continue;
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    if (!graph.hasEdge(e.source, e.target)) {
      try {
        graph.addEdge(e.source, e.target);
      } catch {
        // ignore duplicate edges in undirected graph
      }
    }
  }

  // Run Louvain — returns Record<nodeId, communityId (number)>
  let communities: Record<string, number> = {};
  if (graph.order > 0) {
    communities = louvain(graph) as Record<string, number>;
  }

  // Group nodes by community
  const communityToNodeIds = new Map<number, string[]>();
  for (const [nodeId, communityId] of Object.entries(communities)) {
    const list = communityToNodeIds.get(communityId) ?? [];
    list.push(nodeId);
    communityToNodeIds.set(communityId, list);
  }

  // Nodes not touched by Louvain get their own singleton community
  const nodeIdsInCommunity = new Set(Object.keys(communities));
  let nextSyntheticId = 10000;
  for (const n of nodes) {
    if (!nodeIdsInCommunity.has(n.id)) {
      const list = communityToNodeIds.get(nextSyntheticId) ?? [];
      list.push(n.id);
      communityToNodeIds.set(nextSyntheticId, list);
      communities[n.id] = nextSyntheticId;
      nextSyntheticId++;
    }
  }

  // Build lookup
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Build GraphCluster objects
  const clusters: GraphCluster[] = [];
  const communityKeys = Array.from(communityToNodeIds.keys()).sort((a, b) => a - b);

  const communityToClusterId = new Map<number, string>();

  for (let i = 0; i < communityKeys.length; i++) {
    const communityId = communityKeys[i];
    const memberIds = communityToNodeIds.get(communityId)!;
    const clusterId = nanoid();
    communityToClusterId.set(communityId, clusterId);

    // Dominant directory label
    const dirCounts = new Map<string, number>();
    for (const nid of memberIds) {
      const node = nodeById.get(nid);
      if (!node) continue;
      const parts = node.filePath.split('/');
      const dir = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
    let dominantDir = 'unknown';
    let maxCount = 0;
    for (const [dir, count] of dirCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantDir = dir;
      }
    }

    clusters.push({
      id: clusterId,
      label: dominantDir,
      color: PALETTE[i % PALETTE.length],
      nodeIds: memberIds,
      centroid3d: { x: 0, y: 0, z: 0 }, // filled by layout
    });
  }

  // Assign clusterId to nodes
  const nodesWithClusters = nodes.map((n) => {
    const communityId = communities[n.id];
    const clusterId = communityId !== undefined
      ? communityToClusterId.get(communityId) ?? null
      : null;
    return { ...n, clusterId };
  });

  return { clusters, nodesWithClusters };
}
