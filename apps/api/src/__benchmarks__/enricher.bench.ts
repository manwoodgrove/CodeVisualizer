import { bench, describe } from 'vitest';
import { enrichGraph } from '../services/graph/enricher.js';
import type { GraphNode, GraphEdge, NodeMetrics, Vec3 } from '@cv/types';

const createNode = (id: string, name: string, filePath: string): GraphNode => ({
  id,
  name,
  filePath,
  kind: 'FUNCTION',
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

const createEdge = (source: string, target: string): GraphEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  kind: 'CALL',
  weight: 1,
  resolved: false,
});

describe('enrichGraph Performance', () => {
  const NUM_FILES = 100;
  const NODES_PER_FILE = 50;
  const EDGES_COUNT = 10000;

  const nodes: GraphNode[] = [];
  for (let f = 0; f < NUM_FILES; f++) {
    const filePath = `file_${f}.ts`;
    for (let n = 0; n < NODES_PER_FILE; n++) {
      nodes.push(createNode(`n_${f}_${n}`, `func_${n}`, filePath));
    }
  }

  const edges: GraphEdge[] = [];
  for (let e = 0; e < EDGES_COUNT; e++) {
    const sourceIdx = Math.floor(Math.random() * nodes.length);
    const targetIdx = Math.floor(Math.random() * NODES_PER_FILE);
    // Each file has a func_0, func_1, ... func_49
    // We want to call func_targetIdx, which exists in every file.
    // The enricher will have to search through NUM_FILES candidates for each edge.
    edges.push(createEdge(nodes[sourceIdx].id, `func_${targetIdx}`));
  }

  bench('enrichGraph with many candidates', () => {
    enrichGraph(nodes, edges);
  });
});
