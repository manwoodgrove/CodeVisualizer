import { parse, simpleTraverse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { GraphNode, GraphEdge, NodeKind, EdgeKind, Language } from '@codevisualizer/types';
import { nanoid } from 'nanoid';

export interface ParseResult {
  filePath: string;
  nodes: Omit<GraphNode, 'clusterId' | 'position3d'>[];
  edges: Omit<GraphEdge, 'id'>[];
  errors: string[];
}

function detectLanguage(filePath: string): Language {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript';
}

function nodeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function countLines(node: TSESTree.Node): number {
  return (node.loc?.end.line ?? 0) - (node.loc?.start.line ?? 0) + 1;
}

function cyclomaticComplexity(body: TSESTree.Node | null | undefined): number {
  if (!body) return 1;
  let count = 1;
  simpleTraverse(body, {
    visitors: {
      IfStatement: () => { count++; },
      ConditionalExpression: () => { count++; },
      LogicalExpression: (rawNode) => {
        const node = rawNode as TSESTree.LogicalExpression;
        if (node.operator === '&&' || node.operator === '||') count++;
      },
      ForStatement: () => { count++; },
      ForInStatement: () => { count++; },
      ForOfStatement: () => { count++; },
      WhileStatement: () => { count++; },
      DoWhileStatement: () => { count++; },
      SwitchCase: (rawNode) => {
        const node = rawNode as TSESTree.SwitchCase;
        if (node.test) count++;
      },
      CatchClause: () => { count++; },
    },
  });
  return count;
}

export function parseFile(filePath: string, content: string): ParseResult {
  const errors: string[] = [];
  const nodes: ParseResult['nodes'] = [];
  const edges: ParseResult['edges'] = [];
  const language = detectLanguage(filePath);
  const moduleId = nodeId(filePath, '__module__');

  nodes.push({
    id: moduleId,
    kind: 'MODULE',
    name: filePath.split('/').pop()!,
    filePath,
    language,
    exported: true,
    lineStart: 1,
    lineEnd: content.split('\n').length,
    metrics: { linesOfCode: content.split('\n').length, cyclomaticComplexity: 1, inDegree: 0, outDegree: 0 },
    meta: {},
  });

  let ast: TSESTree.Program;
  try {
    ast = parse(content, {
      jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
      loc: true,
      range: true,
      errorOnUnknownASTType: false,
    });
  } catch (e: unknown) {
    errors.push(`Parse error in ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return { filePath, nodes, edges, errors };
  }

  const exportedNames = new Set<string>();

  function addFunctionNode(
    name: string,
    kind: NodeKind,
    nodeAst: TSESTree.Node,
    exported: boolean,
    body?: TSESTree.Node | null,
  ): string {
    const id = nodeId(filePath, name);
    nodes.push({
      id,
      kind,
      name,
      filePath,
      language,
      exported,
      lineStart: nodeAst.loc?.start.line ?? 0,
      lineEnd: nodeAst.loc?.end.line ?? 0,
      metrics: {
        linesOfCode: countLines(nodeAst),
        cyclomaticComplexity: cyclomaticComplexity(body),
        inDegree: 0,
        outDegree: 0,
      },
      meta: {},
    });
    return id;
  }

  simpleTraverse(ast, {
    visitors: {
      ImportDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.ImportDeclaration;
        edges.push({
          source: moduleId,
          target: String(node.source.value),
          kind: 'IMPORT' as EdgeKind,
          weight: 1,
          resolved: false,
        });
      },

      ExportNamedDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.ExportNamedDeclaration;
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
            exportedNames.add(node.declaration.id.name);
          } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
            exportedNames.add(node.declaration.id.name);
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const decl of node.declaration.declarations) {
              if (decl.id.type === 'Identifier') exportedNames.add(decl.id.name);
            }
          }
        }
        for (const spec of node.specifiers) {
          if (spec.exported.type === 'Identifier') exportedNames.add(spec.exported.name);
        }
      },

      ExportDefaultDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.ExportDefaultDeclaration;
        const decl = node.declaration as TSESTree.FunctionDeclaration;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          exportedNames.add(decl.id.name);
        }
      },

      ClassDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.ClassDeclaration;
        if (!node.id) return;
        const name = node.id.name;
        const id = addFunctionNode(name, 'CLASS', node, exportedNames.has(name), node.body);
        const superClass = node.superClass as TSESTree.Identifier | null;
        if (superClass?.type === 'Identifier') {
          edges.push({
            source: id,
            target: nodeId(filePath, superClass.name),
            kind: 'INHERITANCE',
            weight: 1,
            resolved: false,
          });
        }
      },

      FunctionDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.FunctionDeclaration;
        if (!node.id) return;
        addFunctionNode(node.id.name, 'FUNCTION', node, exportedNames.has(node.id.name), node.body);
      },

      VariableDeclaration: (rawNode) => {
        const node = rawNode as TSESTree.VariableDeclaration;
        for (const decl of node.declarations) {
          if (
            decl.id.type !== 'Identifier' ||
            !decl.init ||
            (decl.init.type !== 'ArrowFunctionExpression' && decl.init.type !== 'FunctionExpression')
          ) continue;
          const name = decl.id.name;
          const fn = decl.init as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
          addFunctionNode(name, 'FUNCTION', node, exportedNames.has(name), fn.body);
        }
      },

      CallExpression: (rawNode) => {
        const node = rawNode as TSESTree.CallExpression;
        let calleeName: string | null = null;
        if (node.callee.type === 'Identifier') {
          calleeName = node.callee.name;
        } else if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier'
        ) {
          calleeName = node.callee.property.name;
        }
        if (!calleeName) return;
        edges.push({
          source: moduleId,
          target: nodeId(filePath, calleeName),
          kind: 'CALL',
          weight: 1,
          resolved: false,
        });
      },
    },
  });

  return { filePath, nodes, edges, errors };
}
