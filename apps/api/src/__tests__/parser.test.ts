import { describe, it, expect } from 'vitest';
import { parseFile } from '../services/parser/js-ts-parser.js';

describe('parseFile', () => {
  it('parses a class with methods and call edges', () => {
    const source = `
export class Animal {
  constructor(public name: string) {}

  speak(): string {
    return greet(this.name);
  }

  move(distance: number): void {
    if (distance > 0) {
      this.speak();
    }
  }
}

function greet(name: string): string {
  return \`Hello \${name}\`;
}
`.trim();

    const result = parseFile('src/animal.ts', source);

    expect(result.filePath).toBe('src/animal.ts');

    const kinds = result.nodes.map((n) => n.kind);
    expect(kinds).toContain('MODULE');
    expect(kinds).toContain('CLASS');
    expect(kinds).toContain('METHOD');
    expect(kinds).toContain('FUNCTION');

    const classNode = result.nodes.find((n) => n.kind === 'CLASS');
    expect(classNode?.name).toBe('Animal');
    expect(classNode?.exported).toBe(true);

    const fnNode = result.nodes.find((n) => n.kind === 'FUNCTION');
    expect(fnNode?.name).toBe('greet');

    // Should have CALL edges (speak calling greet, move calling speak)
    const callEdges = result.edges.filter((e) => e.kind === 'CALL');
    expect(callEdges.length).toBeGreaterThan(0);
    const calleeNames = callEdges.map((e) => e.targetName);
    expect(calleeNames).toContain('greet');
  });

  it('parses import declarations and export variables', () => {
    const source = `
import { readFile } from 'fs/promises';
import path from 'path';

export const CONFIG_PATH = './config.json';
export const MAX_RETRIES = 3;

export async function loadConfig(): Promise<string> {
  const data = await readFile(path.join(CONFIG_PATH), 'utf-8');
  return data;
}
`.trim();

    const result = parseFile('src/config.ts', source);

    // Import edges from module
    const importEdges = result.edges.filter((e) => e.kind === 'IMPORT');
    expect(importEdges.length).toBe(2);
    const importTargets = importEdges.map((e) => e.targetName);
    expect(importTargets).toContain('fs/promises');
    expect(importTargets).toContain('path');

    // importMap should contain local bindings
    expect(result.importMap['readFile']).toBe('fs/promises');
    expect(result.importMap['path']).toBe('path');

    // Exported variable nodes
    const varNodes = result.nodes.filter((n) => n.kind === 'VARIABLE');
    expect(varNodes.length).toBeGreaterThan(0);
    const varNames = varNodes.map((n) => n.name);
    expect(varNames).toContain('CONFIG_PATH');

    // Exported function
    const fnNode = result.nodes.find((n) => n.kind === 'FUNCTION' && n.name === 'loadConfig');
    expect(fnNode).toBeDefined();
    expect(fnNode?.exported).toBe(true);
  });

  it('parses arrow functions with nested calls', () => {
    const source = `
function add(a: number, b: number): number {
  return a + b;
}

const multiply = (a: number, b: number): number => {
  return add(a, 0) + add(b, 0);
};

export const compute = (x: number, y: number): number => {
  const sum = add(x, y);
  const product = multiply(x, y);
  return sum + product;
};
`.trim();

    const result = parseFile('src/math.ts', source);

    const fnNodes = result.nodes.filter((n) => n.kind === 'FUNCTION');
    const fnNames = fnNodes.map((n) => n.name);
    expect(fnNames).toContain('add');
    expect(fnNames).toContain('multiply');
    expect(fnNames).toContain('compute');

    const computeNode = fnNodes.find((n) => n.name === 'compute');
    expect(computeNode?.exported).toBe(true);

    const addNode = fnNodes.find((n) => n.name === 'add');
    expect(addNode?.exported).toBe(false);

    // CALL edges from compute and multiply to add
    const callEdges = result.edges.filter((e) => e.kind === 'CALL');
    const calleeNames = callEdges.map((e) => e.targetName);
    expect(calleeNames).toContain('add');
    expect(calleeNames).toContain('multiply');

    // cyclomatic complexity of add = 1 (no branches)
    expect(addNode?.cyclomaticComplexity).toBe(1);
  });
});
