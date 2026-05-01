import { describe, it, expect } from 'vitest';
import { parseFile } from '../services/parser/js-ts-parser.js';
import { buildGraph } from '../services/graph/builder.js';
import { enrichGraph } from '../services/graph/enricher.js';
import type { FetchedFile } from '../services/github/fetcher.js';

describe('TypeChecker-based cross-file CALL resolver', () => {
  it('resolves a cross-file CALL edge from b.ts caller() -> a.ts foo()', () => {
    const aSource = `export function foo() { return 42; }`;
    const bSource = `import { foo } from './a.js';\nexport function caller() { return foo(); }`;

    const aFile: FetchedFile = { path: 'a.ts', content: aSource, size: aSource.length };
    const bFile: FetchedFile = { path: 'b.ts', content: bSource, size: bSource.length };

    const parseA = parseFile('a.ts', aSource);
    const parseB = parseFile('b.ts', bSource);

    const { nodes, edges } = buildGraph([parseA, parseB]);
    const { nodes: enrichedNodes, edges: enrichedEdges } = enrichGraph(nodes, edges, [aFile, bFile]);

    // Find the caller node in b.ts
    const callerNode = enrichedNodes.find((n) => n.name === 'caller' && n.filePath === 'b.ts');
    expect(callerNode).toBeDefined();

    // Find the foo node in a.ts
    const fooNode = enrichedNodes.find((n) => n.name === 'foo' && n.filePath === 'a.ts');
    expect(fooNode).toBeDefined();

    // Find the CALL edge from caller -> foo
    const callEdge = enrichedEdges.find(
      (e) => e.kind === 'CALL' && e.source === callerNode!.id && e.target === fooNode!.id,
    );

    expect(callEdge).toBeDefined();
    expect(callEdge?.resolved).toBe(true);
  });

  it('still resolves same-file CALL edges via fallback heuristic', () => {
    const cSource = `
function x() { return 1; }
function y() { return x(); }
`.trim();

    const cFile: FetchedFile = { path: 'c.ts', content: cSource, size: cSource.length };

    const parseC = parseFile('c.ts', cSource);
    const { nodes, edges } = buildGraph([parseC]);
    const { nodes: enrichedNodes, edges: enrichedEdges } = enrichGraph(nodes, edges, [cFile]);

    const xNode = enrichedNodes.find((n) => n.name === 'x' && n.filePath === 'c.ts');
    const yNode = enrichedNodes.find((n) => n.name === 'y' && n.filePath === 'c.ts');
    expect(xNode).toBeDefined();
    expect(yNode).toBeDefined();

    // y() calls x() — should resolve regardless of whether TypeChecker or heuristic handles it
    const callEdge = enrichedEdges.find(
      (e) => e.kind === 'CALL' && e.source === yNode!.id && e.target === xNode!.id,
    );

    expect(callEdge).toBeDefined();
    expect(callEdge?.resolved).toBe(true);
  });
});
