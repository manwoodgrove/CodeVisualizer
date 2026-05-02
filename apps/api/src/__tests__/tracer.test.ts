import { describe, it, expect } from 'vitest';
import { simulateSignal } from '../services/simulator/tracer.js';
import type { GraphSnapshot, GraphNode, GraphEdge } from '@cv/types';

function createMockSnapshot(nodes: Partial<GraphNode>[], edges: Partial<GraphEdge>[]): GraphSnapshot {
  return {
    repoId: 'test-repo',
    repoName: 'test-repo',
    nodes: nodes as GraphNode[],
    edges: edges as GraphEdge[],
    clusters: [],
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      clusterCount: 0,
      fileCount: 1,
      byKind: { MODULE: 0, CLASS: 0, FUNCTION: 0, METHOD: 0, VARIABLE: 0 },
      byEdge: { IMPORT: 0, CALL: 0, INHERITANCE: 0, DATA_FLOW: 0, EXPORT: 0 },
    },
  };
}

describe('simulateSignal', () => {
  it('performs a basic BFS traversal of CALL edges', () => {
    const snapshot = createMockSnapshot(
      [
        { id: 'A', name: 'funcA' },
        { id: 'B', name: 'funcB' },
        { id: 'C', name: 'funcC' },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'CALL', resolved: true },
        { id: 'e2', source: 'B', target: 'C', kind: 'CALL', resolved: true },
        { id: 'e3', source: 'A', target: 'C', kind: 'IMPORT', resolved: true }, // Should be ignored
      ]
    );

    const result = simulateSignal(snapshot, 'A', { frameGapMs: 100 });

    expect(result.seedNodeId).toBe('A');
    expect(result.frames.length).toBe(3);

    // Frame 0: Seed
    expect(result.frames[0].activeNodeIds).toEqual(['A']);
    expect(result.frames[0].activeEdgeIds).toEqual([]);
    expect(result.frames[0].timestamp).toBe(0);

    // Frame 1: A -> B
    expect(result.frames[1].activeNodeIds).toEqual(['B']);
    expect(result.frames[1].activeEdgeIds).toEqual(['e1']);
    expect(result.frames[1].timestamp).toBe(200);

    // Frame 2: B -> C
    expect(result.frames[2].activeNodeIds).toEqual(['C']);
    expect(result.frames[2].activeEdgeIds).toEqual(['e2']);
    expect(result.frames[2].timestamp).toBe(300);
  });

  it('respects maxHops parameter', () => {
    const snapshot = createMockSnapshot(
      [
        { id: 'A', name: 'funcA' },
        { id: 'B', name: 'funcB' },
        { id: 'C', name: 'funcC' },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'CALL', resolved: true },
        { id: 'e2', source: 'B', target: 'C', kind: 'CALL', resolved: true },
      ]
    );

    const result = simulateSignal(snapshot, 'A', { maxHops: 1 });

    // Seed frame + 1 hop = 2 frames total
    expect(result.frames.length).toBe(2);
    expect(result.frames[1].activeNodeIds).toEqual(['B']);
  });

  it('supports bidirectional traversal', () => {
    const snapshot = createMockSnapshot(
      [
        { id: 'A', name: 'funcA' },
        { id: 'B', name: 'funcB' },
        { id: 'C', name: 'funcC' },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'CALL', resolved: true },
        { id: 'e2', source: 'B', target: 'C', kind: 'CALL', resolved: true },
      ]
    );

    // If starting from B, normally it would only go to C.
    // Bidirectional means it should go to A and C.
    const result = simulateSignal(snapshot, 'B', { bidirectional: true });

    expect(result.frames.length).toBe(2);
    // B goes to A (reverse e1) and C (forward e2)
    // Order depends on how adjacency is built, but it will contain both
    expect(result.frames[1].activeNodeIds).toContain('A');
    expect(result.frames[1].activeNodeIds).toContain('C');
    expect(result.frames[1].activeNodeIds.length).toBe(2);
    expect(result.frames[1].activeEdgeIds).toContain('e1');
    expect(result.frames[1].activeEdgeIds).toContain('e2');
  });

  it('stops immediately if seed node has no outgoing edges', () => {
    const snapshot = createMockSnapshot(
      [
        { id: 'A', name: 'funcA' },
        { id: 'B', name: 'funcB' },
      ],
      [
        { id: 'e1', source: 'A', target: 'B', kind: 'CALL', resolved: true },
      ]
    );

    const result = simulateSignal(snapshot, 'B');

    expect(result.frames.length).toBe(1);
    expect(result.frames[0].activeNodeIds).toEqual(['B']);
  });
});
