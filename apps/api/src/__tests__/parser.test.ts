import { describe, it, expect } from 'vitest';
import { enrichGraph } from '../services/graph/enricher.js';
import type { GraphNode, GraphEdge } from '@cv/types';

const BASE_METRICS = {
  linesOfCode: 1,
  cyclomaticComplexity: 1,
  inDegree: 0,
  outDegree: 0,
};
const BASE_POS = { x: 0, y: 0, z: 0 };

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'name' | 'filePath'>): GraphNode {
  return {
    kind: 'FUNCTION',
    exported: true,
    lineStart: 1,
    lineEnd: 1,
    clusterId: null,
    metrics: { ...BASE_METRICS },
    position3d: { ...BASE_POS },
    ...overrides,
  };
}

describe('enrichGraph — CALL resolution', () => {
  it('resolves unique-name call via name-based lookup (no TypeChecker needed)', () => {
    const nodes: GraphNode[] = [
      makeNode({ id: 'id-foo', name: 'foo', filePath: 'a.ts' }),
      makeNode({ id: 'id-caller', name: 'caller', filePath: 'b.ts', exported: false }),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'id-caller', target: 'foo', kind: 'CALL', weight: 1, resolved: false },
    ];

    const { edges: enriched } = enrichGraph(nodes, edges);
    const call = enriched.find((e) => e.kind === 'CALL')!;
    expect(call.resolved).toBe(true);
    expect(call.target).toBe('id-foo');
  });

  it('uses TypeChecker to disambiguate cross-file call when two functions share a name', () => {
    // a.ts and b.ts both export function foo().
    // c.ts imports foo from a.ts and calls it.
    // Without TypeChecker the fallback picks the first candidate arbitrarily;
    // with TypeChecker it must resolve to id-a-foo.
    const nodes: GraphNode[] = [
      makeNode({ id: 'id-a-foo', name: 'foo', filePath: '/test/a.ts' }),
      makeNode({ id: 'id-b-foo', name: 'foo', filePath: '/test/b.ts' }),
      makeNode({ id: 'id-c-mod', name: 'c',   filePath: '/test/c.ts', exported: false, kind: 'MODULE' }),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'id-c-mod', target: 'foo', kind: 'CALL', weight: 1, resolved: false },
    ];
    const files = new Map<string, string>([
      ['/test/a.ts', `export function foo() { return 42; }`],
      ['/test/b.ts', `export function foo() { return 99; }`],
      ['/test/c.ts', `import { foo } from './a.js';\nfoo();`],
    ]);

    const { edges: enriched } = enrichGraph(nodes, edges, files);
    const call = enriched.find((e) => e.kind === 'CALL')!;
    expect(call.resolved).toBe(true);
    expect(call.target).toBe('id-a-foo');
  });

  it('falls back to same-file preference when TypeChecker cannot resolve', () => {
    // Two nodes named 'helper': one in the caller's file, one elsewhere.
    // No file contents provided — TypeChecker not available.
    // Fallback must prefer the same-file match.
    const nodes: GraphNode[] = [
      makeNode({ id: 'id-local-helper',  name: 'helper', filePath: 'src/utils.ts' }),
      makeNode({ id: 'id-remote-helper', name: 'helper', filePath: 'src/other.ts' }),
      makeNode({ id: 'id-caller',        name: 'caller', filePath: 'src/utils.ts', exported: false }),
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'id-caller', target: 'helper', kind: 'CALL', weight: 1, resolved: false },
    ];

    const { edges: enriched } = enrichGraph(nodes, edges);
    const call = enriched.find((e) => e.kind === 'CALL')!;
    expect(call.resolved).toBe(true);
    expect(call.target).toBe('id-local-helper');
  });
});
