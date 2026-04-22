import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, GraphSnapshot, GraphCluster } from '@codevisualizer/types';
import type { ParseResult } from '../parser/js-ts-parser.js';

export function buildGraph(
  repoId: string,
  repoName: string,
  results: ParseResult[],
): Omit<GraphSnapshot, 'clusters'> & { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const rawEdges: Array<Omit<GraphEdge, 'id'>> = [];

  for (const result of results) {
    for (const n of result.nodes) {
      if (!nodeMap.has(n.id)) {
        nodeMap.set(n.id, {
          ...n,
          clusterId: '',
          position3d: { x: 0, y: 0, z: 0 },
        });
      }
    }
    rawEdges.push(...result.edges);
  }

  // Resolve cross-file import edges
  const resolvedEdges: GraphEdge[] = [];
  for (const edge of rawEdges) {
    let targetId = edge.target;
    let resolved = edge.resolved;

    if (edge.kind === 'IMPORT') {
      // Find matching module by path suffix
      const target = findModuleByImportPath(edge.target, nodeMap);
      if (target) {
        targetId = target;
        resolved = true;
      }
    } else if (!nodeMap.has(targetId)) {
      // CALL edge: try to find by name across all files
      const match = findNodeByName(edge.target.split('::').pop() ?? '', nodeMap);
      if (match) {
        targetId = match;
        resolved = true;
      }
    } else {
      resolved = true;
    }

    // Skip self-edges and unresolved imports
    if (targetId === edge.source) continue;
    if (edge.kind === 'IMPORT' && !resolved) continue;

    resolvedEdges.push({ ...edge, id: nanoid(), target: targetId, resolved });
  }

  // Compute in/out degree
  for (const edge of resolvedEdges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (src) src.metrics.outDegree++;
    if (tgt) tgt.metrics.inDegree++;
  }

  const nodes = Array.from(nodeMap.values());
  return {
    repoId,
    repoName,
    nodes,
    edges: resolvedEdges,
    stats: {
      totalFiles: results.length,
      parsedFiles: results.filter(r => r.errors.length === 0).length,
      failedFiles: results.filter(r => r.errors.length > 0).length,
      generatedAt: Date.now(),
    },
  };
}

function findModuleByImportPath(importPath: string, nodeMap: Map<string, GraphNode>): string | null {
  // Strip leading ./ ../
  const clean = importPath.replace(/^\.\.?\//, '').replace(/\.[jt]sx?$/, '');
  for (const [id, node] of nodeMap) {
    if (node.kind !== 'MODULE') continue;
    const fileStem = node.filePath.replace(/\.[jt]sx?$/, '');
    if (fileStem.endsWith(clean) || fileStem.endsWith(clean + '/index')) {
      return id;
    }
  }
  return null;
}

function findNodeByName(name: string, nodeMap: Map<string, GraphNode>): string | null {
  for (const [id, node] of nodeMap) {
    if (node.name === name && node.kind !== 'MODULE') return id;
  }
  return null;
}
