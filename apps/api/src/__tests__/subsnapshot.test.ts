import { describe, it, expect, vi } from 'vitest';
import type { GraphSnapshot } from '@cv/types';
vi.mock('../auth/github.js', () => ({ requireAuth: vi.fn() }));
vi.mock('../db/repos.js', () => ({ createRepo: vi.fn(), getRepo: vi.fn(), getSnapshot: vi.fn(), listRepos: vi.fn() }));
vi.mock('../queue/importQueue.js', () => ({ enqueueImport: vi.fn() }));
import { bfsSubSnapshot } from '../routes/repos.js';

function fixture(): GraphSnapshot {
  const pairs = [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', '__proto__'], ['__proto__', 'd'], ['d', 'd']];
  return {
    repoId: 'repo', repoName: 'repo', clusters: [],
    nodes: ['a', 'b', 'c', '__proto__', 'd', 'isolated'].map((id) => ({
      id, name: id, kind: 'FUNCTION', filePath: 'file.ts', exported: false,
      lineStart: 1, lineEnd: 1, clusterId: null,
      metrics: { linesOfCode: 1, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
      position3d: { x: 0, y: 0, z: 0 },
    })),
    edges: pairs.map(([source, target], i) => ({ id: `e${i}`, source, target, kind: 'CALL', weight: 1, resolved: true })),
    stats: { nodeCount: 6, edgeCount: pairs.length, clusterCount: 0, fileCount: 1,
      byKind: { MODULE: 0, CLASS: 0, FUNCTION: 6, METHOD: 0, VARIABLE: 0 },
      byEdge: { IMPORT: 0, CALL: pairs.length, INHERITANCE: 0, DATA_FLOW: 0, EXPORT: 0 } },
  };
}

function oracle(snapshot: GraphSnapshot, start: string, depth: number) {
  const distance = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift()!;
    const hop = distance.get(node)!;
    if (hop >= depth) continue;
    for (const edge of snapshot.edges) {
      const next = edge.source === node ? edge.target : edge.target === node ? edge.source : undefined;
      if (next !== undefined && !distance.has(next)) {
        distance.set(next, hop + 1);
        queue.push(next);
      }
    }
  }
  return { nodes: snapshot.nodes.filter((n) => distance.has(n.id)),
    edges: snapshot.edges.filter((e) => distance.has(e.source) && distance.has(e.target)) };
}

describe('bfsSubSnapshot', () => {
  it.each([0, 1, 2, 3, 4, 6])('matches a distance oracle at depth %s', (depth) => {
    const snapshot = fixture();
    for (const start of ['a', 'd', '__proto__', 'isolated']) {
      const expected = oracle(snapshot, start, depth);
      const actual = bfsSubSnapshot(snapshot, start, depth);
      expect(actual.nodes).toEqual(expected.nodes);
      expect(actual.edges).toEqual(expected.edges);
      expect(actual.stats.nodeCount).toBe(expected.nodes.length);
      expect(actual.stats.edgeCount).toBe(expected.edges.length);
    }
  });

  it('does not allocate adjacency for a disconnected first hop', () => {
    const snapshot = fixture();
    let reads = 0;
    snapshot.edges = snapshot.edges.map((edge) => ({ ...edge,
      get source() { reads++; return edge.source; } }));
    const result = bfsSubSnapshot(snapshot, 'isolated', 6);
    expect(result.nodes.map((n) => n.id)).toEqual(['isolated']);
    expect(reads).toBe(snapshot.edges.length * 2); // first hop and induced-edge filter
  });
});
