import { nanoid } from 'nanoid';
import type { GraphNode, GraphEdge, SignalFrame, SignalSimulation } from '@codevisualizer/types';

const FRAME_INTERVAL_MS = 300;

export function simulateSignal(
  seedNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxHops = 5,
  direction: 'forward' | 'backward' | 'both' = 'forward',
): SignalSimulation {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const frames: SignalFrame[] = [];

  // Build adjacency: outgoing CALL edges
  const outgoing = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
  const incoming = new Map<string, Array<{ nodeId: string; edgeId: string }>>();

  for (const edge of edges) {
    if (edge.kind !== 'CALL') continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push({ nodeId: edge.target, edgeId: edge.id });
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push({ nodeId: edge.source, edgeId: edge.id });
  }

  // BFS
  const visited = new Set<string>([seedNodeId]);
  let frontier = [seedNodeId];
  let hop = 0;
  let timestamp = 0;

  // Seed frame
  frames.push({
    frameIndex: 0,
    timestamp: 0,
    activeNodeIds: [seedNodeId],
    activeEdgeIds: [],
    stateDeltas: [{
      nodeId: seedNodeId,
      key: 'signal',
      valueBefore: 'idle',
      valueAfter: 'active',
    }],
  });
  timestamp += FRAME_INTERVAL_MS;

  while (frontier.length > 0 && hop < maxHops) {
    const nextFrontier: string[] = [];
    const activeEdgeIds: string[] = [];
    const activeNodeIds: string[] = [];

    for (const current of frontier) {
      const neighbors: Array<{ nodeId: string; edgeId: string }> = [];
      if (direction === 'forward' || direction === 'both') {
        neighbors.push(...(outgoing.get(current) ?? []));
      }
      if (direction === 'backward' || direction === 'both') {
        neighbors.push(...(incoming.get(current) ?? []));
      }

      for (const { nodeId, edgeId } of neighbors) {
        if (visited.has(nodeId) || !nodeById.has(nodeId)) continue;
        visited.add(nodeId);
        nextFrontier.push(nodeId);
        activeNodeIds.push(nodeId);
        activeEdgeIds.push(edgeId);
      }
    }

    if (activeNodeIds.length > 0) {
      frames.push({
        frameIndex: frames.length,
        timestamp,
        activeNodeIds,
        activeEdgeIds,
        stateDeltas: activeNodeIds.map(nid => ({
          nodeId: nid,
          key: 'signal',
          valueBefore: 'idle',
          valueAfter: `called by hop ${hop + 1}`,
        })),
      });
      timestamp += FRAME_INTERVAL_MS;
    }

    frontier = nextFrontier;
    hop++;
  }

  return {
    simulationId: nanoid(),
    seedNodeId,
    frames,
    totalDuration: timestamp,
  };
}
