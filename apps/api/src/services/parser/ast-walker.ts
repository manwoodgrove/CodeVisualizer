import type { TSESTree } from '@typescript-eslint/typescript-estree';

export function walkAST(node: TSESTree.Node, visitor: (n: TSESTree.Node) => void): void {
  function walk(n: TSESTree.Node | null | undefined): void {
    if (!n || typeof n !== 'object') return;

    // Visit the current node
    visitor(n);

    // Iterate over properties to find children
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = (n as unknown as Record<string, unknown>)[key];

      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) walk(c as TSESTree.Node);
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        walk(child as TSESTree.Node);
      }
    }
  }

  walk(node);
}
