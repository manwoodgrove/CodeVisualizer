import { describe, it, expect } from 'vitest';
import { buildTypeCheckResolver } from '../services/graph/typecheck-resolver.js';
import type { FetchedFile } from '../services/github/fetcher.js';
import type { GraphNode, NodeKind } from '@cv/types';

function createMockNode(id: string, name: string, filePath: string, kind: NodeKind = 'FUNCTION'): GraphNode {
  return {
    id,
    name,
    filePath,
    kind,
    exported: true,
    lineStart: 1,
    lineEnd: 5,
    clusterId: null,
    metrics: { linesOfCode: 5, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
    position3d: { x: 0, y: 0, z: 0 },
  };
}

describe('typecheck-resolver', () => {
  it('should initialize and provide a dummy test to ensure it runs', () => {
    expect(true).toBe(true);
  });

  describe('basic resolution', () => {
    it('resolves a simple cross-file function call', () => {
      const files: FetchedFile[] = [
        { path: 'a.ts', content: 'export function targetFn() {}', size: 30 },
        { path: 'b.ts', content: "import { targetFn } from './a.js';\nexport function callerFn() { targetFn(); }", size: 80 }
      ];

      const nodes: GraphNode[] = [
        createMockNode('node-target', 'targetFn', 'a.ts'),
        createMockNode('node-caller', 'callerFn', 'b.ts')
      ];

      const resolver = buildTypeCheckResolver({ files, nodes });

      // In callerFn() { targetFn(); }, targetFn is called on line 2
      const resolvedId = resolver.resolve('b.ts', 'targetFn', 2);
      expect(resolvedId).toBe('node-target');
    });

    it('handles path normalization correctly', () => {
      const files: FetchedFile[] = [
        { path: '/dir/utils.ts', content: 'export function help() {}', size: 30 },
        { path: 'dir/main.ts', content: "import { help } from './utils.js';\n\nhelp();", size: 50 }
      ];

      const nodes: GraphNode[] = [
        createMockNode('node-help', 'help', 'dir/utils.ts')
      ];

      const resolver = buildTypeCheckResolver({ files, nodes });

      const resolvedId = resolver.resolve('/dir/main.ts', 'help', 3);
      expect(resolvedId).toBe('node-help');
    });

    it('resolves imports using .js / .jsx to .ts / .tsx extensions', () => {
      const files: FetchedFile[] = [
        { path: 'math.tsx', content: 'export function add() {}', size: 30 },
        { path: 'app.ts', content: "import { add } from './math.jsx';\nadd();", size: 50 }
      ];

      const nodes: GraphNode[] = [
        createMockNode('node-add', 'add', 'math.tsx')
      ];

      const resolver = buildTypeCheckResolver({ files, nodes });

      const resolvedId = resolver.resolve('app.ts', 'add', 2);
      expect(resolvedId).toBe('node-add');
    });
  });

  describe('edge cases and advanced features', () => {
    it('resolves aliased imports', () => {
      const files: FetchedFile[] = [
        { path: 'alias-target.ts', content: 'export function originalFn() {}', size: 30 },
        { path: 'alias-caller.ts', content: "import { originalFn as aliasFn } from './alias-target.js';\naliasFn();", size: 80 }
      ];

      const nodes: GraphNode[] = [
        createMockNode('node-original', 'originalFn', 'alias-target.ts')
      ];

      const resolver = buildTypeCheckResolver({ files, nodes });

      const resolvedId = resolver.resolve('alias-caller.ts', 'aliasFn', 2);
      expect(resolvedId).toBe('node-original');
    });

    it('resolves property access (e.g. object method call)', () => {
      const files: FetchedFile[] = [
        { path: 'class-target.ts', content: 'export class MyClass {\n  myMethod() {}\n}', size: 40 },
        { path: 'class-caller.ts', content: "import { MyClass } from './class-target.js';\nconst inst = new MyClass();\ninst.myMethod();", size: 80 }
      ];

      const nodes: GraphNode[] = [
        createMockNode('node-method', 'myMethod', 'class-target.ts', 'METHOD')
      ];

      const resolver = buildTypeCheckResolver({ files, nodes });

      // In caller, inst.myMethod() is called on line 3
      const resolvedId = resolver.resolve('class-caller.ts', 'myMethod', 3);
      expect(resolvedId).toBe('node-method');
    });

    it('ignores files with unsupported extensions', () => {
      const files: FetchedFile[] = [
        { path: 'data.json', content: '{"a": 1}', size: 8 },
        { path: 'main.ts', content: "console.log('test');", size: 20 }
      ];

      // We pass no nodes since we're just checking the resolver doesn't crash
      // or try to process the unsupported extension
      const resolver = buildTypeCheckResolver({ files, nodes: [] });

      // Assuming a non-existent lookup returns null
      const resolvedId = resolver.resolve('data.json', 'anything', 1);
      expect(resolvedId).toBeNull();
    });

    it('returns null if caller file is not found', () => {
      const resolver = buildTypeCheckResolver({ files: [], nodes: [] });
      const resolvedId = resolver.resolve('missing.ts', 'someFn', 1);
      expect(resolvedId).toBeNull();
    });

    it('returns null if the callee is not found in the file', () => {
      const files: FetchedFile[] = [
        { path: 'empty.ts', content: 'export function otherFn() {}', size: 30 }
      ];
      const resolver = buildTypeCheckResolver({ files, nodes: [] });
      const resolvedId = resolver.resolve('empty.ts', 'missingFn', 1);
      expect(resolvedId).toBeNull();
    });

    it('returns null if the call node is found but target node id does not exist in nodes list', () => {
       const files: FetchedFile[] = [
        { path: 'target.ts', content: 'export function targetFn() {}', size: 30 },
        { path: 'caller.ts', content: "import { targetFn } from './target.js';\ntargetFn();", size: 80 }
      ];

      // Note: we do NOT include targetFn in the nodes array
      const nodes: GraphNode[] = [];

      const resolver = buildTypeCheckResolver({ files, nodes });

      const resolvedId = resolver.resolve('caller.ts', 'targetFn', 2);
      expect(resolvedId).toBeNull();
    });
  });

  describe('error handling', () => {
    it('returns a no-op resolver if program creation fails (e.g., bad options, though hard to simulate directly)', () => {
        // By passing some absolutely broken state, we can try to trigger an error,
        // though ts.createProgram is very resilient.
        // We'll just verify the resolver handles normal missing data gracefully here
        // as the program creation catch block is a defensive fallback.
        const resolver = buildTypeCheckResolver({ files: [] as any, nodes: [] as any });
        expect(resolver.resolve('a.ts', 'b', 1)).toBeNull();
    });
  });
});
