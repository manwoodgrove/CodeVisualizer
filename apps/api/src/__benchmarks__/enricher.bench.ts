import { bench, describe } from 'vitest';
import { enrichGraph } from '../services/graph/enricher.js';
import type { GraphNode, GraphEdge } from '@cv/types';

describe('enrichGraph performance', () => {
  const nodeCount = 1000;
  const filesCount = 100;
  const edgesCount = 10000;

  const nodes: GraphNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const filePath = `file_${i % filesCount}.ts`;
    nodes.push({
      id: `node_${i}`,
      kind: 'FUNCTION',
      name: `func_${i % 10}`, // Many nodes share the same name
      filePath,
      exported: true,
      lineStart: 1,
      lineEnd: 10,
      clusterId: null,
      metrics: {
        linesOfCode: 10,
        cyclomaticComplexity: 1,
        inDegree: 0,
        outDegree: 0,
      },
      position3d: { x: 0, y: 0, z: 0 },
    });
  }

  const edges: GraphEdge[] = [];
  for (let i = 0; i < edgesCount; i++) {
    const sourceNode = nodes[i % nodeCount];
    edges.push({
      id: `edge_${i}`,
      source: sourceNode.id,
      target: `func_${Math.floor(Math.random() * 10)}`,
      kind: 'CALL',
      weight: 1,
      resolved: false,
    });
  }

  bench('enrichGraph with many CALL edges and shared names', () => {
    enrichGraph(nodes, edges);
  });
});
