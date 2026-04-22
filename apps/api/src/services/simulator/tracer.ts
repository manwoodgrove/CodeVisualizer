import { nanoid } from 'nanoid';
import type { GraphSnapshot, SignalSimulation, SignalFrame, StateDelta } from '@cv/types';

export function simulateSignal(
  snapshot: GraphSnapshot,
  seedNodeId: string,
  opts?: {
    maxHops?: number;
    bidirectional?: boolean;
    frameGapMs?: number;
  },
): SignalSimulation {
  const maxHops = opts?.maxHops ?? 10;
  const bidirectional = opts?.bidirectional ?? false;
  const frameGapMs = opts?.frameGapMs ?? 200;

  // Build adjacency: nodeId -> outgoing CALL edge targets
  const adjacency = new Map<string, Array<{ edgeId: string; targetId: string }>>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== 'CALL' || !edge.resolved) continue;
    const outList = adjacency.get(edge.source) ?? [];
    outList.push({ edgeId: edge.id, targetId: edge.target });
    adjacency.set(edge.source, outList);

    if (bidirectional) {
      const inList = adjacency.get(edge.target) ?? [];
      inList.push({ edgeId: edge.id, targetId: edge.source });
      adjacency.set(edge.target, inList);
    }
  }

  // Node lookup for labels
  const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));

  const frames: SignalFrame[] = [];
  const visited = new Set<string>([seedNodeId]);
  let currentLevel = [seedNodeId];
  let frameIndex = 0;

  // Frame 0: seed node activation
  const seedNode = nodeById.get(seedNodeId);
  const seedDelta: StateDelta = {
    nodeId: seedNodeId,
    label: seedNode ? `${seedNode.name}() → start` : 'start',
  };
  frames.push({
    frameIndex: frameIndex++,
    timestamp: 0,
    activeNodeIds: [seedNodeId],
    activeEdgeIds: [],
    stateDeltas: [seedDelta],
  });

  for (let hop = 0; hop < maxHops && currentLevel.length > 0; hop++) {
    const nextLevel: string[] = [];
    const activeEdgeIds: string[] = [];
    const activeNodeIds: string[] = [];
    const stateDeltas: StateDelta[] = [];

    for (const nodeId of currentLevel) {
      const neighbors = adjacency.get(nodeId) ?? [];
      for (const { edgeId, targetId } of neighbors) {
        if (visited.has(targetId)) continue;
        visited.add(targetId);
        nextLevel.push(targetId);
        activeEdgeIds.push(edgeId);
        activeNodeIds.push(targetId);

        const targetNode = nodeById.get(targetId);
        if (targetNode) {
          stateDeltas.push({
            nodeId: targetId,
            label: `${targetNode.name}(args) → returns`,
          });
        }
      }
    }

    if (activeNodeIds.length === 0) break;

    frames.push({
      frameIndex: frameIndex++,
      timestamp: frameIndex * frameGapMs,
      activeNodeIds,
      activeEdgeIds,
      stateDeltas,
    });

    currentLevel = nextLevel;
  }

  const totalDuration = frames.length > 0 ? frames[frames.length - 1].timestamp + frameGapMs : 0;

  return {
    simulationId: nanoid(),
    seedNodeId,
    frames,
    totalDuration,
  };
}
