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

const CHUNK_SIZE = 500;

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve));
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

    if (++ops >= CHUNK_SIZE) {
      ops = 0;
      await yieldToEventLoop();
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

    if (++ops >= CHUNK_SIZE) {
      ops = 0;
      await yieldToEventLoop();
    }
  }
  return callees;
}


class FileParser {
  private filePath: string;
  private source: string;
  private nodes: RawNode[] = [];
  private edges: RawEdge[] = [];
  private importMap: Record<string, string> = {};
  private exportedNames = new Set<string>();

  constructor(filePath: string, source: string) {
    this.filePath = filePath;
    this.source = source;
  }

  public parse(): ParseResult {
    let ast: TSESTree.Program;
    try {
      ast = parse(this.source, { jsx: true, loc: true, range: false, comment: false, tokens: false });
    } catch {
      const mod: RawNode = {
        localId: moduleLocalId(this.filePath),
        kind: 'MODULE',
        name: this.filePath.split('/').pop() ?? this.filePath,
        filePath: this.filePath,
        exported: false,
        lineStart: 1,
        lineEnd: 1,
        linesOfCode: 1,
        cyclomaticComplexity: 1,
      };
      this.nodes.push(mod);
      return { filePath: this.filePath, nodes: this.nodes, edges: this.edges, importMap: this.importMap };
    }

    const totalLines = this.source.split('\n').length;
    const moduleNode: RawNode = {
      localId: moduleLocalId(this.filePath),
      kind: 'MODULE',
      name: this.filePath.split('/').pop() ?? this.filePath,
      filePath: this.filePath,
      exported: false,
      lineStart: 1,
      lineEnd: totalLines,
      linesOfCode: totalLines,
      cyclomaticComplexity: 1,
    };
    this.nodes.push(moduleNode);

    this.collectExportedNames(ast);
    this.processStatements(ast);

    return { filePath: this.filePath, nodes: this.nodes, edges: this.edges, importMap: this.importMap };
  }

  private collectExportedNames(ast: TSESTree.Program): void {
    for (const stmt of ast.body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        const exp = stmt as TSESTree.ExportNamedDeclaration;
        if (exp.declaration) {
          const decl = exp.declaration;
          if (decl.type === 'FunctionDeclaration' && decl.id) {
            this.exportedNames.add(decl.id.name);
          } else if (decl.type === 'ClassDeclaration' && decl.id) {
            this.exportedNames.add(decl.id.name);
          } else if (decl.type === 'VariableDeclaration') {
            for (const vd of decl.declarations) {
              if (vd.id.type === 'Identifier') this.exportedNames.add(vd.id.name);
            }
          }
        }
        for (const spec of exp.specifiers) {
          this.exportedNames.add(spec.local.name);
        }
      } else if (stmt.type === 'ExportDefaultDeclaration') {
        const def = stmt as TSESTree.ExportDefaultDeclaration;
        if (def.declaration.type === 'Identifier') {
          this.exportedNames.add((def.declaration as TSESTree.Identifier).name);
        } else if (
          def.declaration.type === 'FunctionDeclaration' &&
          (def.declaration as TSESTree.FunctionDeclaration).id
        ) {
          this.exportedNames.add((def.declaration as TSESTree.FunctionDeclaration).id!.name);
        } else if (
          def.declaration.type === 'ClassDeclaration' &&
          (def.declaration as TSESTree.ClassDeclaration).id
        ) {
          this.exportedNames.add((def.declaration as TSESTree.ClassDeclaration).id!.name);
        }
      }
    }
  }

  private processStatements(ast: TSESTree.Program): void {
    for (const stmt of ast.body) {
      if (stmt.type === 'ImportDeclaration') {
        const imp = stmt as TSESTree.ImportDeclaration;
        const specifier = imp.source.value as string;
        for (const s of imp.specifiers) {
          this.importMap[s.local.name] = specifier;
        }
        this.edges.push({
          sourceLocalId: moduleLocalId(this.filePath),
          targetName: specifier,
          targetFilePath: specifier,
          kind: 'IMPORT',
          weight: 1,
        });
      } else if (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') {
        let decl: TSESTree.Node | null = null;
        if (stmt.type === 'ExportNamedDeclaration') {
          decl = (stmt as TSESTree.ExportNamedDeclaration).declaration ?? null;
        } else {
          decl = (stmt as TSESTree.ExportDefaultDeclaration).declaration;
        }
        if (decl) this.processTopLevelDecl(decl, true);
      } else {
        this.processTopLevelDecl(stmt, false);
      }
    }
  }

  private processTopLevelDecl(decl: TSESTree.Node, forceExported: boolean): void {
    if (decl.type === 'FunctionDeclaration') {
      this.processFunctionDeclaration(decl as TSESTree.FunctionDeclaration, forceExported);
    } else if (decl.type === 'ClassDeclaration') {
      this.processClassDeclaration(decl as TSESTree.ClassDeclaration, forceExported);
    } else if (decl.type === 'VariableDeclaration') {
      this.processVariableDeclaration(decl as TSESTree.VariableDeclaration, forceExported);
    }
  }

  private processFunctionDeclaration(fn: TSESTree.FunctionDeclaration, forceExported: boolean): void {
    if (!fn.id) return;
    const name = fn.id.name;
    const lineStart = fn.loc!.start.line;
    const lineEnd = fn.loc!.end.line;
    const isExported = forceExported || this.exportedNames.has(name);
    const localId = makeLocalId('FUNCTION', this.filePath, lineStart, name);

    this.nodes.push({
      localId,
      kind: 'FUNCTION',
      name,
      filePath: this.filePath,
      exported: isExported,
      lineStart,
      lineEnd,
      linesOfCode: lineEnd - lineStart + 1,
      cyclomaticComplexity: countComplexity(fn.body ?? fn),
    });

    for (const callee of extractCallees(fn.body ?? fn)) {
      this.edges.push({ sourceLocalId: localId, targetName: callee, kind: 'CALL', weight: 1 });
    }
  }

  private processClassDeclaration(cls: TSESTree.ClassDeclaration, forceExported: boolean): void {
    if (!cls.id) return;
    const name = cls.id.name;
    const lineStart = cls.loc!.start.line;
    const lineEnd = cls.loc!.end.line;
    const isExported = forceExported || this.exportedNames.has(name);
    const classLocalId = makeLocalId('CLASS', this.filePath, lineStart, name);

    this.nodes.push({
      localId: classLocalId,
      kind: 'CLASS',
      name,
      filePath: this.filePath,
      exported: isExported,
      lineStart,
      lineEnd,
      linesOfCode: lineEnd - lineStart + 1,
      cyclomaticComplexity: 1,
    });

    if (cls.superClass && cls.superClass.type === 'Identifier') {
      this.edges.push({
        sourceLocalId: classLocalId,
        targetName: (cls.superClass as TSESTree.Identifier).name,
        kind: 'INHERITANCE',
        weight: 1,
      });
    }

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
        const methodLocalId = makeLocalId('METHOD', this.filePath, mLineStart, `${name}.${methodName}`);

        this.nodes.push({
          localId: methodLocalId,
          kind: 'METHOD',
          name: `${name}.${methodName}`,
          filePath: this.filePath,
          exported: isExported,
          lineStart: mLineStart,
          lineEnd: mLineEnd,
          linesOfCode: mLineEnd - mLineStart + 1,
          cyclomaticComplexity: countComplexity(method.value),
        });

        for (const callee of extractCallees(method.value)) {
          this.edges.push({ sourceLocalId: methodLocalId, targetName: callee, kind: 'CALL', weight: 1 });
        }
      }
    }
  }

  private processVariableDeclaration(varDecl: TSESTree.VariableDeclaration, forceExported: boolean): void {
    for (const declarator of varDecl.declarations) {
      if (declarator.id.type !== 'Identifier') continue;
      const name = (declarator.id as TSESTree.Identifier).name;
      const lineStart = declarator.loc!.start.line;
      const lineEnd = declarator.loc!.end.line;
      const isExported = forceExported || this.exportedNames.has(name);
      const init = declarator.init;

      if (
        init &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      ) {
        const localId = makeLocalId('FUNCTION', this.filePath, lineStart, name);
        this.nodes.push({
          localId,
          kind: 'FUNCTION',
          name,
          filePath: this.filePath,
          exported: isExported,
          lineStart,
          lineEnd,
          linesOfCode: lineEnd - lineStart + 1,
          cyclomaticComplexity: countComplexity(init),
        });
        for (const callee of extractCallees(init)) {
          this.edges.push({ sourceLocalId: localId, targetName: callee, kind: 'CALL', weight: 1 });
        }
      } else if (isExported) {
        const localId = makeLocalId('VARIABLE', this.filePath, lineStart, name);
        this.nodes.push({
          localId,
          kind: 'VARIABLE',
          name,
          filePath: this.filePath,
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

export function parseFile(filePath: string, source: string): ParseResult {
  const parser = new FileParser(filePath, source);
  return parser.parse();
}
