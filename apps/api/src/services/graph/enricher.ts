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

  // Name -> filePath -> node (for O(1) CALL/INHERITANCE resolution)
  const nodesByNameAndFile = new Map<string, Map<string, GraphNode>>();
  // Name -> first seen node (for fallback when no same-file match)
  const nodesByNameFallback = new Map<string, GraphNode>();

  for (const n of nodes) {
    let fileMap = nodesByNameAndFile.get(n.name);
    if (!fileMap) {
      fileMap = new Map();
      nodesByNameAndFile.set(n.name, fileMap);
    }
    if (!fileMap.has(n.filePath)) {
      fileMap.set(n.filePath, n);
    }

    if (!nodesByNameFallback.has(n.name)) {
      nodesByNameFallback.set(n.name, n);
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
        const fileMap = nodesByNameAndFile.get(calleeName);
        if (fileMap) {
          const sameFile = sourceNode ? fileMap.get(sourceNode.filePath) : undefined;
          const best = sameFile ?? nodesByNameFallback.get(calleeName);
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
        const fileMap = nodesByNameAndFile.get(superName);
        if (fileMap) {
          const sameFile = sourceNode ? fileMap.get(sourceNode.filePath) : undefined;
          const best = sameFile ?? nodesByNameFallback.get(superName);
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
