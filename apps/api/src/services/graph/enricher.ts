import type { GraphNode, GraphEdge } from '@cv/types';

export function enrichGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Build lookup maps for resolution
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Name -> nodes (for CALL resolution)
  const nodesByName = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const list = nodesByName.get(n.name) ?? [];
    list.push(n);
    nodesByName.set(n.name, list);
  }

  // Reset degrees
  for (const n of nodes) {
    n.metrics.inDegree = 0;
    n.metrics.outDegree = 0;
  }

  const enrichedEdges: GraphEdge[] = [];

  for (const edge of edges) {
    if (edge.kind === 'CALL') {
      const calleeName = edge.target;
      const sourceNode = nodeById.get(edge.source);

      let resolved = false;
      let resolvedTarget = calleeName;

      const candidates = nodesByName.get(calleeName) ?? [];
      if (candidates.length > 0) {
        // Prefer same-file match
        const sameFile = sourceNode
          ? candidates.find((c) => c.filePath === sourceNode.filePath)
          : undefined;
        const best = sameFile ?? candidates[0];
        resolvedTarget = best.id;
        resolved = true;
      }

      enrichedEdges.push({ ...edge, target: resolvedTarget, resolved });
    } else if (edge.kind === 'INHERITANCE') {
      const superName = edge.target;
      const candidates = nodesByName.get(superName) ?? [];
      if (candidates.length > 0) {
        const sourceNode = nodeById.get(edge.source);
        const sameFile = sourceNode
          ? candidates.find((c) => c.filePath === sourceNode.filePath)
          : undefined;
        const best = sameFile ?? candidates[0];
        enrichedEdges.push({ ...edge, target: best.id, resolved: true });
      } else {
        enrichedEdges.push({ ...edge, resolved: false });
      }
    } else {
      // IMPORT, DATA_FLOW, EXPORT — keep as-is with resolved=false if target is not a node id
      const targetIsNodeId = nodeById.has(edge.target);
      enrichedEdges.push({ ...edge, resolved: targetIsNodeId });
    }
  }

  // Compute in/out degrees on resolved edges
  for (const edge of enrichedEdges) {
    const src = nodeById.get(edge.source);
    if (src) src.metrics.outDegree++;

    if (edge.resolved) {
      const tgt = nodeById.get(edge.target);
      if (tgt) tgt.metrics.inDegree++;
    }
  }

  return { nodes, edges: enrichedEdges };
}
