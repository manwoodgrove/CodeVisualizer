import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { NodeKind, EdgeKind } from '@cv/types';

export interface RawNode {
  localId: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  exported: boolean;
  lineStart: number;
  lineEnd: number;
  linesOfCode: number;
  cyclomaticComplexity: number;
}

export interface RawEdge {
  sourceLocalId: string;
  targetName: string;
  targetFilePath?: string;
  kind: EdgeKind;
  weight: number;
}

export interface ParseResult {
  filePath: string;
  nodes: RawNode[];
  edges: RawEdge[];
  importMap: Record<string, string>;
}

function makeLocalId(kind: NodeKind, filePath: string, lineStart: number, name: string): string {
  return `${kind}:${filePath}:${lineStart}:${name}`;
}

function moduleLocalId(filePath: string): string {
  return `MODULE:${filePath}:1:module`;
}

async function countComplexity(node: TSESTree.Node): Promise<number> {
  let count = 0;
  const stack: TSESTree.Node[] = [node];
  let ops = 0;

  while (stack.length > 0) {
    const n = stack.pop()!;
    switch (n.type) {
      case 'IfStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ConditionalExpression':
      case 'CatchClause':
        count++;
        break;
      case 'SwitchCase':
        if ((n as TSESTree.SwitchCase).test !== null) count++;
        break;
      case 'LogicalExpression':
        if (
          (n as TSESTree.LogicalExpression).operator === '&&' ||
          (n as TSESTree.LogicalExpression).operator === '||'
        ) {
          count++;
        }
        break;
      default:
        break;
    }

    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (let i = child.length - 1; i >= 0; i--) {
          const c = child[i];
          if (c && typeof c === 'object' && 'type' in c) stack.push(c as TSESTree.Node);
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }

    if (++ops >= 500) {
      ops = 0;
      await new Promise(r => setImmediate(r));
    }
  }
  return count + 1;
}

async function extractCallees(node: TSESTree.Node): Promise<string[]> {
  const callees: string[] = [];
  const stack: TSESTree.Node[] = [node];
  let ops = 0;

  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.type === 'CallExpression') {
      const callee = (n as TSESTree.CallExpression).callee;
      if (callee.type === 'Identifier') {
        callees.push((callee as TSESTree.Identifier).name);
      } else if (callee.type === 'MemberExpression') {
        const prop = (callee as TSESTree.MemberExpression).property;
        if (prop.type === 'Identifier') {
          callees.push((prop as TSESTree.Identifier).name);
        }
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue;
      const child = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (let i = child.length - 1; i >= 0; i--) {
          const c = child[i];
          if (c && typeof c === 'object' && 'type' in c) stack.push(c as TSESTree.Node);
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }

    if (++ops >= 500) {
      ops = 0;
      await new Promise(r => setImmediate(r));
    }
  }
  return callees;
}

export async function parseFile(filePath: string, source: string): Promise<ParseResult> {
  const nodes: RawNode[] = [];
  const edges: RawEdge[] = [];
  const importMap: Record<string, string> = {};

  let ast: TSESTree.Program;
  try {
    ast = parse(source, { jsx: true, loc: true, range: false, comment: false, tokens: false });
  } catch {
    // Return minimal result on parse error
    const mod: RawNode = {
      localId: moduleLocalId(filePath),
      kind: 'MODULE',
      name: filePath.split('/').pop() ?? filePath,
      filePath,
      exported: false,
      lineStart: 1,
      lineEnd: 1,
      linesOfCode: 1,
      cyclomaticComplexity: 1,
    };
    nodes.push(mod);
    return { filePath, nodes, edges, importMap };
  }

  const totalLines = source.split('\n').length;
  const moduleNode: RawNode = {
    localId: moduleLocalId(filePath),
    kind: 'MODULE',
    name: filePath.split('/').pop() ?? filePath,
    filePath,
    exported: false,
    lineStart: 1,
    lineEnd: totalLines,
    linesOfCode: totalLines,
    cyclomaticComplexity: 1,
  };
  nodes.push(moduleNode);

  // Track which names are exported
  const exportedNames = new Set<string>();

  // First pass: collect exported names
  for (const stmt of ast.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      const exp = stmt as TSESTree.ExportNamedDeclaration;
      if (exp.declaration) {
        const decl = exp.declaration;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          exportedNames.add(decl.id.name);
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          exportedNames.add(decl.id.name);
        } else if (decl.type === 'VariableDeclaration') {
          for (const vd of decl.declarations) {
            if (vd.id.type === 'Identifier') exportedNames.add(vd.id.name);
          }
        }
      }
      for (const spec of exp.specifiers) {
        exportedNames.add(spec.local.name);
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const def = stmt as TSESTree.ExportDefaultDeclaration;
      if (
        def.declaration.type === 'Identifier'
      ) {
        exportedNames.add((def.declaration as TSESTree.Identifier).name);
      } else if (
        def.declaration.type === 'FunctionDeclaration' &&
        (def.declaration as TSESTree.FunctionDeclaration).id
      ) {
        exportedNames.add((def.declaration as TSESTree.FunctionDeclaration).id!.name);
      } else if (
        def.declaration.type === 'ClassDeclaration' &&
        (def.declaration as TSESTree.ClassDeclaration).id
      ) {
        exportedNames.add((def.declaration as TSESTree.ClassDeclaration).id!.name);
      }
    }
  }

  // Process top-level statements
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') {
      const imp = stmt as TSESTree.ImportDeclaration;
      const specifier = imp.source.value as string;
      // Map each local binding to the module specifier
      for (const s of imp.specifiers) {
        importMap[s.local.name] = specifier;
      }
      // IMPORT edge from module node
      edges.push({
        sourceLocalId: moduleLocalId(filePath),
        targetName: specifier,
        targetFilePath: specifier,
        kind: 'IMPORT',
        weight: 1,
      });
    } else if (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') {
      // Handle inline declarations within exports
      let decl: TSESTree.Node | null = null;
      if (stmt.type === 'ExportNamedDeclaration') {
        decl = (stmt as TSESTree.ExportNamedDeclaration).declaration ?? null;
      } else {
        decl = (stmt as TSESTree.ExportDefaultDeclaration).declaration;
      }
      if (decl) await processTopLevelDecl(decl, true);
    } else {
      await processTopLevelDecl(stmt, false);
    }
  }

  async function processTopLevelDecl(decl: TSESTree.Node, forceExported: boolean): Promise<void> {
    if (decl.type === 'FunctionDeclaration') {
      const fn = decl as TSESTree.FunctionDeclaration;
      if (!fn.id) return;
      const name = fn.id.name;
      const lineStart = fn.loc!.start.line;
      const lineEnd = fn.loc!.end.line;
      const isExported = forceExported || exportedNames.has(name);
      const localId = makeLocalId('FUNCTION', filePath, lineStart, name);
      nodes.push({
        localId,
        kind: 'FUNCTION',
        name,
        filePath,
        exported: isExported,
        lineStart,
        lineEnd,
        linesOfCode: lineEnd - lineStart + 1,
        cyclomaticComplexity: await countComplexity(fn.body ?? fn),
      });
      // CALL edges from this function
      for (const callee of await extractCallees(fn.body ?? fn)) {
        edges.push({ sourceLocalId: localId, targetName: callee, kind: 'CALL', weight: 1 });
      }
    } else if (decl.type === 'ClassDeclaration') {
      const cls = decl as TSESTree.ClassDeclaration;
      if (!cls.id) return;
      const name = cls.id.name;
      const lineStart = cls.loc!.start.line;
      const lineEnd = cls.loc!.end.line;
      const isExported = forceExported || exportedNames.has(name);
      const classLocalId = makeLocalId('CLASS', filePath, lineStart, name);
      nodes.push({
        localId: classLocalId,
        kind: 'CLASS',
        name,
        filePath,
        exported: isExported,
        lineStart,
        lineEnd,
        linesOfCode: lineEnd - lineStart + 1,
        cyclomaticComplexity: 1,
      });
      // INHERITANCE edge
      if (cls.superClass && cls.superClass.type === 'Identifier') {
        edges.push({
          sourceLocalId: classLocalId,
          targetName: (cls.superClass as TSESTree.Identifier).name,
          kind: 'INHERITANCE',
          weight: 1,
        });
      }
      // Methods
      for (const member of cls.body.body) {
        if (member.type === 'MethodDefinition') {
          const method = member as TSESTree.MethodDefinition;
          const methodName =
            method.key.type === 'Identifier'
              ? (method.key as TSESTree.Identifier).name
              : method.key.type === 'Literal'
              ? String((method.key as TSESTree.Literal).value)
              : 'unknown';
          const mLineStart = method.loc!.start.line;
          const mLineEnd = method.loc!.end.line;
          const methodLocalId = makeLocalId('METHOD', filePath, mLineStart, `${name}.${methodName}`);
          nodes.push({
            localId: methodLocalId,
            kind: 'METHOD',
            name: `${name}.${methodName}`,
            filePath,
            exported: isExported,
            lineStart: mLineStart,
            lineEnd: mLineEnd,
            linesOfCode: mLineEnd - mLineStart + 1,
            cyclomaticComplexity: await countComplexity(method.value),
          });
          // CALL edges from method
          for (const callee of await extractCallees(method.value)) {
            edges.push({ sourceLocalId: methodLocalId, targetName: callee, kind: 'CALL', weight: 1 });
          }
        }
      }
    } else if (decl.type === 'VariableDeclaration') {
      const varDecl = decl as TSESTree.VariableDeclaration;
      for (const declarator of varDecl.declarations) {
        if (declarator.id.type !== 'Identifier') continue;
        const name = (declarator.id as TSESTree.Identifier).name;
        const lineStart = declarator.loc!.start.line;
        const lineEnd = declarator.loc!.end.line;
        const isExported = forceExported || exportedNames.has(name);
        const init = declarator.init;
        if (
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
        ) {
          const localId = makeLocalId('FUNCTION', filePath, lineStart, name);
          nodes.push({
            localId,
            kind: 'FUNCTION',
            name,
            filePath,
            exported: isExported,
            lineStart,
            lineEnd,
            linesOfCode: lineEnd - lineStart + 1,
            cyclomaticComplexity: await countComplexity(init),
          });
          for (const callee of await extractCallees(init)) {
            edges.push({ sourceLocalId: localId, targetName: callee, kind: 'CALL', weight: 1 });
          }
        } else if (isExported) {
          // Exported non-function variable
          const localId = makeLocalId('VARIABLE', filePath, lineStart, name);
          nodes.push({
            localId,
            kind: 'VARIABLE',
            name,
            filePath,
            exported: isExported,
            lineStart,
            lineEnd,
            linesOfCode: lineEnd - lineStart + 1,
            cyclomaticComplexity: 1,
          });
        }
      }
    }
  }

  return { filePath, nodes, edges, importMap };
}
