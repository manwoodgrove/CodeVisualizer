import { describe, it, expect } from 'vitest';
import { parseFile } from '../services/parser/js-ts-parser.js';
import { buildGraph } from '../services/graph/builder.js';
import { enrichGraph } from '../services/graph/enricher.js';
import type { FetchedFile } from '../services/github/fetcher.js';

describe('INHERITANCE fallback resolution (heuristic, no TypeChecker)', () => {
  it('prefers same-file match when subclass and superclass are in the same file', () => {
    const source = `
class Base {}
class Child extends Base {}
`.trim();

    const parseResult = parseFile('single.ts', source);
    const { nodes, edges } = buildGraph([parseResult]);
    // No files passed — TypeChecker resolver is disabled, pure heuristic path
    const { nodes: enrichedNodes, edges: enrichedEdges } = enrichGraph(nodes, edges);

    const baseNode = enrichedNodes.find((n) => n.name === 'Base' && n.filePath === 'single.ts');
    const childNode = enrichedNodes.find((n) => n.name === 'Child' && n.filePath === 'single.ts');
    expect(baseNode).toBeDefined();
    expect(childNode).toBeDefined();

    const inheritanceEdge = enrichedEdges.find(
      (e) => e.kind === 'INHERITANCE' && e.source === childNode!.id && e.target === baseNode!.id,
    );

    expect(inheritanceEdge).toBeDefined();
    expect(inheritanceEdge?.resolved).toBe(true);
  });

  it('falls back deterministically to the first-seen node when superclass is defined in multiple files', () => {
    // Base defined in two files; Child is in a third file with no local Base
    const aSource = `export class Base {}`;
    const bSource = `export class Base {}`;
    const cSource = `export class Child extends Base {}`;

    const parseA = parseFile('a.ts', aSource);
    const parseB = parseFile('b.ts', bSource);
    const parseC = parseFile('c.ts', cSource);

    // a.ts is processed first, so its Base node is the "first seen"
    const { nodes, edges } = buildGraph([parseA, parseB, parseC]);
    // No files passed — TypeChecker resolver is disabled, pure heuristic path
    const { nodes: enrichedNodes, edges: enrichedEdges } = enrichGraph(nodes, edges);

    const baseInA = enrichedNodes.find((n) => n.name === 'Base' && n.filePath === 'a.ts');
    const childNode = enrichedNodes.find((n) => n.name === 'Child' && n.filePath === 'c.ts');
    expect(baseInA).toBeDefined();
    expect(childNode).toBeDefined();

    // Child has no same-file Base, so fallback must resolve to the first-seen Base (from a.ts)
    const inheritanceEdge = enrichedEdges.find(
      (e) => e.kind === 'INHERITANCE' && e.source === childNode!.id,
    );

    expect(inheritanceEdge).toBeDefined();
    expect(inheritanceEdge?.resolved).toBe(true);
    expect(inheritanceEdge?.target).toBe(baseInA!.id);
  });
});

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
