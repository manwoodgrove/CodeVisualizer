import * as ts from 'typescript';
import type { GraphNode, GraphEdge } from '@cv/types';

// ---------------------------------------------------------------------------
// TypeChecker helpers (adapted from manwoodgrove/cross-file-call-resolution)
// ---------------------------------------------------------------------------

function normalizeKey(files: Map<string, string>, name: string): string | null {
  if (files.has(name)) return name;
  const tsName = name.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
  if (files.has(tsName)) return tsName;
  return null;
}

function resolveRelativePath(containingFile: string, modulePath: string): string {
  const dir = containingFile.includes('/')
    ? containingFile.split('/').slice(0, -1).join('/')
    : '';
  const combined = dir ? `${dir}/${modulePath}` : modulePath;
  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  return resolved.join('/');
}

function buildProgram(files: Map<string, string>): ts.Program {
  const defaultHost = ts.createCompilerHost({});

  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(name, langVer) {
      const key = normalizeKey(files, name);
      if (key !== null) {
        return ts.createSourceFile(name, files.get(key)!, langVer, true);
      }
      return defaultHost.getSourceFile(name, langVer);
    },
    fileExists(name) {
      return normalizeKey(files, name) !== null || defaultHost.fileExists(name);
    },
    readFile(name) {
      const key = normalizeKey(files, name);
      return key !== null ? files.get(key) : defaultHost.readFile(name);
    },
    resolveModuleNames(moduleNames, containingFile) {
      return moduleNames.map((modName) => {
        if (!modName.startsWith('.')) return undefined; // skip package/stdlib imports
        const resolved = resolveRelativePath(containingFile, modName);
        const key = normalizeKey(files, resolved);
        if (key !== null) return { resolvedFileName: key, isExternalLibraryImport: false };
        return undefined;
      });
    },
  };

  return ts.createProgram(Array.from(files.keys()), {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
  }, host);
}

function resolveCallWithTC(
  program: ts.Program,
  checker: ts.TypeChecker,
  callerFilePath: string,
  calleeName: string,
  nodesByName: Map<string, GraphNode[]>,
): string | null {
  const sf = program.getSourceFile(callerFilePath);
  if (!sf) return null;

  let result: string | null = null;

  function visit(node: ts.Node): void {
    if (result !== null) return;
    if (ts.isCallExpression(node)) {
      // Match simple identifier or last segment of a member expression
      const exprText = node.expression.getText(sf!).split('.').pop() ?? '';
      if (exprText === calleeName) {
        const sym = checker.getSymbolAtLocation(node.expression);
        if (sym) {
          let actual = sym;
          if (sym.flags & ts.SymbolFlags.Alias) {
            try { actual = checker.getAliasedSymbol(sym); } catch { /* ignore */ }
          }
          const decls = actual.declarations;
          if (decls?.length) {
            const declFile = decls[0].getSourceFile().fileName;
            const declName = actual.name;
            const candidates = nodesByName.get(declName) ?? [];
            const match = candidates.find(
              (n) =>
                n.filePath === declFile ||
                declFile.endsWith('/' + n.filePath) ||
                n.filePath.endsWith('/' + declFile),
            );
            if (match) result = match.id;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function enrichGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fileContents?: Map<string, string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const nodesByName = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const list = nodesByName.get(n.name) ?? [];
    list.push(n);
    nodesByName.set(n.name, list);
  }

  for (const n of nodes) {
    n.metrics.inDegree = 0;
    n.metrics.outDegree = 0;
  }

  // Build one ts.Program per enrichGraph call (not per edge) for efficiency.
  // Only constructed when file contents are provided and there is potential ambiguity.
  let tcProgram: ts.Program | null = null;
  let tcChecker: ts.TypeChecker | null = null;
  if (fileContents && fileContents.size > 0) {
    tcProgram = buildProgram(fileContents);
    tcChecker = tcProgram.getTypeChecker();
  }

  const enrichedEdges: GraphEdge[] = [];

  for (const edge of edges) {
    if (edge.kind === 'CALL') {
      const calleeName = edge.target;
      const sourceNode = nodeById.get(edge.source);

      const candidates = nodesByName.get(calleeName) ?? [];

      if (candidates.length === 0) {
        enrichedEdges.push({ ...edge, resolved: false });
        continue;
      }

      if (candidates.length === 1) {
        // Unique name — no ambiguity, skip TypeChecker
        enrichedEdges.push({ ...edge, target: candidates[0].id, resolved: true });
        continue;
      }

      // Ambiguous: try TypeChecker first
      if (tcProgram && tcChecker && sourceNode) {
        const tcTarget = resolveCallWithTC(
          tcProgram, tcChecker,
          sourceNode.filePath, calleeName,
          nodesByName,
        );
        if (tcTarget) {
          enrichedEdges.push({ ...edge, target: tcTarget, resolved: true });
          continue;
        }
      }

      // Fallback: prefer same-file match, then first candidate
      const sameFile = sourceNode
        ? candidates.find((c) => c.filePath === sourceNode.filePath)
        : undefined;
      const best = sameFile ?? candidates[0];
      enrichedEdges.push({ ...edge, target: best.id, resolved: true });
    } else if (edge.kind === 'INHERITANCE') {
      const superName = edge.target;
      const candidates = nodesByName.get(superName) ?? [];
      if (candidates.length > 0) {
        const sourceNode = nodeById.get(edge.source);
        const sameFile = sourceNode
          ? candidates.find((c) => c.filePath === sourceNode.filePath)
          : undefined;
        const best = sameFile ?? candidates[0];
        enrichedEdges.push({ ...edge, target: best.id, resolved: true });
      } else {
        enrichedEdges.push({ ...edge, resolved: false });
      }
    } else {
      const targetIsNodeId = nodeById.has(edge.target);
      enrichedEdges.push({ ...edge, resolved: targetIsNodeId });
    }
  }

  for (const edge of enrichedEdges) {
    const src = nodeById.get(edge.source);
    if (src) src.metrics.outDegree++;
    if (edge.resolved) {
      const tgt = nodeById.get(edge.target);
      if (tgt) tgt.metrics.inDegree++;
    }
  }

  return { nodes, edges: enrichedEdges };
}
