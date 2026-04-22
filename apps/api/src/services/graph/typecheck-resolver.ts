import ts from 'typescript';
import type { FetchedFile } from '../github/fetcher.js';
import type { GraphNode } from '@cv/types';

export interface ResolverInput {
  files: FetchedFile[];
  nodes: GraphNode[];
}

export interface ResolverLookup {
  /**
   * Resolve a call/inheritance target to a GraphNode.id.
   * Returns null if the checker cannot identify the declaration,
   * in which case the caller should fall back to the name heuristic.
   */
  resolve(callerFilePath: string, calleeName: string, callerLineStart: number): string | null;
}

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function hasAllowedExtension(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return ALLOWED_EXTENSIONS.has(path.slice(dot));
}

/** Strip leading slash so caller and lookup paths agree. */
function normalizePath(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p;
}

export function buildTypeCheckResolver(input: ResolverInput): ResolverLookup {
  const { files, nodes } = input;

  // Build map from normalized filePath -> source text (only parseable files)
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (hasAllowedExtension(f.path)) {
      fileMap.set(normalizePath(f.path), f.content);
    }
  }

  // Build node lookup keyed by "normalizedFilePath::name" for O(1) lookup
  const nodeByKey = new Map<string, GraphNode>();
  for (const n of nodes) {
    const key = `${normalizePath(n.filePath)}::${n.name}`;
    // If multiple nodes share the same key, prefer exported ones or just keep first
    if (!nodeByKey.has(key)) {
      nodeByKey.set(key, n);
    }
  }

  // Compiler options matching the plan spec
  const opts: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
  };

  // Pre-build SourceFiles so the host can serve them
  const sourceFileMap = new Map<string, ts.SourceFile>();
  for (const [normalizedPath, content] of fileMap) {
    const sf = ts.createSourceFile(normalizedPath, content, ts.ScriptTarget.ES2022, true);
    sourceFileMap.set(normalizedPath, sf);
  }

  const rootNames = Array.from(sourceFileMap.keys());

  /**
   * Look up a file by name, remapping .js -> .ts and .jsx -> .tsx
   * so that `import { x } from './a.js'` can find `a.ts` in the virtual map.
   */
  function lookupSourceFile(fileName: string): ts.SourceFile | undefined {
    const norm = normalizePath(fileName);
    if (sourceFileMap.has(norm)) return sourceFileMap.get(norm);
    // Try extension remapping: .js -> .ts, .jsx -> .tsx
    const remapped = norm.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
    if (remapped !== norm && sourceFileMap.has(remapped)) return sourceFileMap.get(remapped);
    return undefined;
  }

  function lookupText(fileName: string): string | undefined {
    const norm = normalizePath(fileName);
    if (fileMap.has(norm)) return fileMap.get(norm);
    const remapped = norm.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
    if (remapped !== norm && fileMap.has(remapped)) return fileMap.get(remapped);
    return undefined;
  }

  // Custom compiler host serving in-memory files
  const host: ts.CompilerHost = {
    getSourceFile(fileName: string, _languageVersion: ts.ScriptTarget) {
      return lookupSourceFile(fileName);
    },
    fileExists(fileName: string): boolean {
      return lookupText(fileName) !== undefined;
    },
    readFile(fileName: string): string | undefined {
      return lookupText(fileName);
    },
    getDefaultLibFileName(options: ts.CompilerOptions): string {
      return ts.getDefaultLibFileName(options);
    },
    writeFile(): void {
      // no-op: noEmit
    },
    getCurrentDirectory(): string {
      return '';
    },
    getNewLine(): string {
      return '\n';
    },
    useCaseSensitiveFileNames(): boolean {
      return false;
    },
    getCanonicalFileName(fileName: string): string {
      return normalizePath(fileName).toLowerCase();
    },
  };

  let program: ts.Program;
  let checker: ts.TypeChecker;

  try {
    program = ts.createProgram(rootNames, opts, host);
    checker = program.getTypeChecker();
  } catch {
    // If program creation fails, return a no-op resolver
    return { resolve: () => null };
  }

  /**
   * Walk the AST of sourceFile looking for a CallExpression whose callee
   * matches calleeName and whose line is within ±2 of targetLine (1-based).
   */
  function findCallNode(
    sourceFile: ts.SourceFile,
    calleeName: string,
    targetLine: number,
  ): ts.Node | null {
    let found: ts.Node | null = null;

    function visit(node: ts.Node): void {
      if (found) return;

      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        let identifierNode: ts.Node | null = null;
        let name: string | null = null;

        if (ts.isIdentifier(expr)) {
          name = expr.text;
          identifierNode = expr;
        } else if (ts.isPropertyAccessExpression(expr)) {
          name = expr.name.text;
          identifierNode = expr.name;
        }

        if (name === calleeName && identifierNode !== null) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const line = pos.line + 1; // convert 0-based to 1-based
          if (Math.abs(line - targetLine) <= 2) {
            found = identifierNode;
          }
        }
      }

      if (!found) {
        ts.forEachChild(node, visit);
      }
    }

    visit(sourceFile);
    return found;
  }

  return {
    resolve(callerFilePath: string, calleeName: string, callerLineStart: number): string | null {
      try {
        const normalizedCaller = normalizePath(callerFilePath);
        const sourceFile = sourceFileMap.get(normalizedCaller);
        if (!sourceFile) return null;

        const callNode = findCallNode(sourceFile, calleeName, callerLineStart);
        if (!callNode) return null;

        let symbol = checker.getSymbolAtLocation(callNode);
        if (!symbol) return null;

        // Dereference import aliases
        if (symbol.flags & ts.SymbolFlags.Alias) {
          symbol = checker.getAliasedSymbol(symbol);
        }

        const declarations = symbol.declarations;
        if (!declarations || declarations.length === 0) return null;

        const decl = declarations[0];
        const declSourceFile = decl.getSourceFile();
        if (!declSourceFile) return null;

        const declPath = normalizePath(declSourceFile.fileName);
        const symName = symbol.getName();

        const key = `${declPath}::${symName}`;
        const node = nodeByKey.get(key);
        return node?.id ?? null;
      } catch {
        return null;
      }
    },
  };
}
