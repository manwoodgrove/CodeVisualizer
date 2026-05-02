import { describe, it, expect, vi } from 'vitest';
import { clusterGraph } from '../services/graph/clusterer.js';
import type { GraphNode, GraphEdge } from '@cv/types';

// Mock graphology to simulate throwing on addEdge
vi.mock('graphology', async () => {
  const actual = await vi.importActual('graphology') as any;
  const ActualGraph = actual.default;

  return {
    default: class MockGraph extends ActualGraph {
      constructor(options: any) {
        super(options);
      }

      addEdge(source: string, target: string, attributes?: any) {
        if (source === 'throw' || target === 'throw') {
          throw new Error('Simulated duplicate edge error');
        }
        return super.addEdge(source, target, attributes);
      }
    }
  };
});

describe('clusterGraph', () => {
  it('should ignore errors when adding duplicate edges to the undirected graph', () => {
    const nodes: GraphNode[] = [
      { id: '1', kind: 'FUNCTION', name: 'fn1', filePath: 'src/file1.ts' },
      { id: 'throw', kind: 'FUNCTION', name: 'fn2', filePath: 'src/file2.ts' }
    ];

    // The edge from '1' to 'throw' will trigger the mocked error
    const edges: GraphEdge[] = [
      { id: 'e1', source: '1', target: 'throw', kind: 'CALL', targetName: 'fn2' }
    ];

    // the function shouldn't throw despite the graphology throwing an error.
    expect(() => clusterGraph(nodes, edges)).not.toThrow();
  });

  it('should also gracefully handle duplicate edges passed in the input without throwing', () => {
     const nodes: GraphNode[] = [
      { id: '1', kind: 'FUNCTION', name: 'fn1', filePath: 'src/file1.ts' },
      { id: '2', kind: 'FUNCTION', name: 'fn2', filePath: 'src/file2.ts' }
    ];

    // Duplicate edges (same source and target)
    const edges: GraphEdge[] = [
      { id: 'e1', source: '1', target: '2', kind: 'CALL', targetName: 'fn2' },
      // Note: the `clusterGraph` uses `hasEdge(source, target)` which returns true if
      // there is an undirected edge. So `addEdge` shouldn't even be called for the second edge.
      // But we can test regular duplicate edges too.
      { id: 'e2', source: '1', target: '2', kind: 'CALL', targetName: 'fn2' },
      { id: 'e3', source: '2', target: '1', kind: 'CALL', targetName: 'fn1' },
    ];

    expect(() => clusterGraph(nodes, edges)).not.toThrow();
  });
});
