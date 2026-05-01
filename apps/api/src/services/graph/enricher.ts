import type { GraphNode, GraphEdge } from '@cv/types';
import type { FetchedFile } from '../github/fetcher.js';
import { buildTypeCheckResolver } from './typecheck-resolver.js';

export function enrichGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  files?: FetchedFile[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Build TypeChecker-based resolver when file sources are available
  const resolver = files && files.length > 0
    ? buildTypeCheckResolver({ files, nodes })
    : null;

  // Build lookup maps for resolution
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // CALL resolution lookups:
  // - nodesByName: name -> filePath -> node
  // - firstNodeByName: first node seen for a given name (fallback)
  const nodesByName = new Map<string, Map<string, GraphNode>>();
  const firstNodeByName = new Map<string, GraphNode>();

  for (const n of nodes) {
    let fileMap = nodesByName.get(n.name);
    if (!fileMap) {
      fileMap = new Map<string, GraphNode>();
      nodesByName.set(n.name, fileMap);
    }
    // If there are multiple nodes with the same name in the same file, we keep the first one we see.
    if (!fileMap.has(n.filePath)) {
      fileMap.set(n.filePath, n);
    }

    if (!firstNodeByName.has(n.name)) {
      firstNodeByName.set(n.name, n);
    }
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

      // First: try TypeChecker-based resolver (cross-file accuracy)
      if (resolver && sourceNode) {
        const tcId = resolver.resolve(
          sourceNode.filePath,
          calleeName,
          sourceNode.lineStart,
        );
        if (tcId !== null) {
          resolvedTarget = tcId;
          resolved = true;
        }
      }

      // Fallback: name-based heuristic (prefer same-file match)
      if (!resolved) {
        const candidates = nodesByName.get(calleeName);
        if (candidates) {
          const sameFile = sourceNode ? candidates.get(sourceNode.filePath) : undefined;
          const best = sameFile ?? firstNodeByName.get(calleeName);
          if (best) {
            resolvedTarget = best.id;
            resolved = true;
          }
        }
      }

      enrichedEdges.push({ ...edge, target: resolvedTarget, resolved });
    } else if (edge.kind === 'INHERITANCE') {
      const superName = edge.target;
      const sourceNode = nodeById.get(edge.source);

      let resolved = false;
      let resolvedTarget = superName;

      // First: try TypeChecker-based resolver
      if (resolver && sourceNode) {
        const tcId = resolver.resolve(
          sourceNode.filePath,
          superName,
          sourceNode.lineStart,
        );
        if (tcId !== null) {
          resolvedTarget = tcId;
          resolved = true;
        }
      }

      // Fallback: name-based heuristic
      if (!resolved) {
        const candidates = nodesByName.get(superName);
        if (candidates) {
          const sameFile = sourceNode ? candidates.get(sourceNode.filePath) : undefined;
          const best = sameFile ?? firstNodeByName.get(superName);
          if (best) {
            resolvedTarget = best.id;
            resolved = true;
          }
        }
      }

      enrichedEdges.push({ ...edge, target: resolvedTarget, resolved });
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
