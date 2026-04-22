import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, NodeKind, EdgeKind } from '@cv/types';
import type { ParseResult, RawNode, RawEdge } from '../parser/js-ts-parser.js';

export function buildGraph(parseResults: ParseResult[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Map from localId -> global GraphNode id
  const localIdToGlobalId = new Map<string, string>();

  const nodes: GraphNode[] = [];

  for (const result of parseResults) {
    for (const raw of result.nodes) {
      const globalId = nanoid();
      localIdToGlobalId.set(raw.localId, globalId);
      nodes.push(rawNodeToGraphNode(raw, globalId));
    }
  }

  // Build edges, merging duplicate IMPORT edges by summing weight
  const edgeMap = new Map<string, GraphEdge>();

  for (const result of parseResults) {
    for (const raw of result.edges) {
      const sourceGlobalId = localIdToGlobalId.get(raw.sourceLocalId);
      if (!sourceGlobalId) continue;

      // For now, target is left as targetName (enricher resolves it)
      const targetRef = raw.targetFilePath ?? raw.targetName;
      const dedupeKey = `${raw.kind}:${sourceGlobalId}:${targetRef}`;

      const existing = edgeMap.get(dedupeKey);
      if (existing && raw.kind === 'IMPORT') {
        existing.weight += raw.weight;
      } else if (!existing) {
        const edge: GraphEdge = {
          id: nanoid(),
          source: sourceGlobalId,
          target: targetRef, // enricher will resolve to node id
          kind: raw.kind,
          weight: raw.weight,
          resolved: false,
        };
        edgeMap.set(dedupeKey, edge);
      }
    }
  }

  const edges = Array.from(edgeMap.values());
  return { nodes, edges };
}

function rawNodeToGraphNode(raw: RawNode, id: string): GraphNode {
  return {
    id,
    kind: raw.kind,
    name: raw.name,
    filePath: raw.filePath,
    exported: raw.exported,
    lineStart: raw.lineStart,
    lineEnd: raw.lineEnd,
    clusterId: null,
    metrics: {
      linesOfCode: raw.linesOfCode,
      cyclomaticComplexity: raw.cyclomaticComplexity,
      inDegree: 0,
      outDegree: 0,
    },
    position3d: { x: 0, y: 0, z: 0 },
  };
}
