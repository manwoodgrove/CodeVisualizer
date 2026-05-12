import { bench, describe } from 'vitest';
import type { GraphNode, GraphSnapshot } from '@cv/types';

// Create a large number of mocked nodes
const numNodes = 50000;
const mockNodes = Array.from({ length: numNodes }, (_, i) => ({
  id: `node_${i}`,
  name: `Module_${i}`,
  filePath: `/src/module_${i}.ts`,
  kind: 'module',
  community: 0,
  x: 0,
  y: 0,
  size: 1,
  degree: 1,
}));

const mockSnapshot = {
  nodes: mockNodes,
  edges: [],
  stats: { nodeCount: numNodes, edgeCount: 0 },
};

// Target IDs spread across the array (start, middle, end)
const targetIds = [`node_10`, `node_25000`, `node_49990`];

// Prepare the Map index
const nodeIndex = new Map<string, any>();
for (const node of mockSnapshot.nodes) {
  nodeIndex.set(node.id, node);
  if (node.filePath) nodeIndex.set(node.filePath, node);
  if (node.name) nodeIndex.set(node.name, node);
}

describe('Node Lookup Performance', () => {
  bench('Array.prototype.find', () => {
    for (const targetId of targetIds) {
      const node = mockSnapshot.nodes.find(
        (n) => n.id === targetId || n.filePath === targetId || n.name === targetId
      );
    }
  });

  bench('Map.prototype.get', () => {
    for (const targetId of targetIds) {
      const node = nodeIndex.get(targetId);
    }
  });
});
