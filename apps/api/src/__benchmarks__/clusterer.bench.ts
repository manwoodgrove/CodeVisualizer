import { bench, describe } from 'vitest';
import { clusterGraph } from '../services/graph/clusterer';
import type { GraphNode, GraphEdge } from '@cv/types';

const mockNodes: GraphNode[] = [];
const mockEdges: GraphEdge[] = [];

for (let i = 0; i < 15000; i++) {
  mockNodes.push({
    id: `node-${i}`,
    kind: 'MODULE',
    name: `file${i}`,
    filePath: `src/dir${i % 10}/file${i}.ts`,
    exported: false,
    lineStart: 1,
    lineEnd: 10,
    clusterId: null,
    metrics: { linesOfCode: 10, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
    position3d: { x: 0, y: 0, z: 0 },
  });
}

// Few edges so Louvain leaves many nodes untouched.
// Use deterministic arithmetic to keep the graph topology fixed across runs.
for (let i = 0; i < 100; i++) {
  const source = `node-${(i * 7) % 100}`;
  const target = `node-${(i * 13) % 100}`;
  mockEdges.push({ id: `edge-${i}`, source, target, kind: 'IMPORT', weight: 1, resolved: true });
}

describe('clusterer', () => {
  bench('clusterGraph', () => {
    clusterGraph(mockNodes, mockEdges);
  });
});
