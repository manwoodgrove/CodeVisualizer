import { bench, describe } from 'vitest';
import { clusterGraph } from '../services/graph/clusterer';
import type { GraphNode, GraphEdge } from '@cv/types';

const mockNodes: GraphNode[] = [];
const mockEdges: GraphEdge[] = [];

for (let i = 0; i < 15000; i++) {
  mockNodes.push({ id: `node-${i}`, filePath: `src/dir${i % 10}/file${i}.ts` } as GraphNode);
}

// Few edges so Louvain leaves many nodes untouched
for (let i = 0; i < 100; i++) {
  const source = `node-${Math.floor(Math.random() * 100)}`;
  const target = `node-${Math.floor(Math.random() * 100)}`;
  mockEdges.push({ source, target, kind: 'IMPORT' } as GraphEdge);
}

describe('clusterer', () => {
  bench('clusterGraph', () => {
    clusterGraph(mockNodes, mockEdges);
  });
});
