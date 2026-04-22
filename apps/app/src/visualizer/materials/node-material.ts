import * as pc from 'playcanvas';
import type { NodeKind } from '@codevisualizer/types';
import { NODE_COLORS } from './palette.js';

const materialCache = new Map<string, pc.StandardMaterial>();

export function getNodeMaterial(app: pc.Application, kind: NodeKind, active = false): pc.StandardMaterial {
  const key = `${kind}_${active}`;
  if (materialCache.has(key)) return materialCache.get(key)!;

  const mat = new pc.StandardMaterial();
  const base = NODE_COLORS[kind];
  mat.diffuse = base.clone();
  mat.metalness = 0.2;
  mat.gloss = 0.6;

  if (active) {
    mat.emissive = new pc.Color(base.r * 0.8, base.g * 0.8, base.b * 0.8);
    mat.emissiveIntensity = 1.5;
  }

  mat.update();
  materialCache.set(key, mat);
  return mat;
}

export function getHoverMaterial(app: pc.Application, kind: NodeKind): pc.StandardMaterial {
  const key = `${kind}_hover`;
  if (materialCache.has(key)) return materialCache.get(key)!;

  const mat = new pc.StandardMaterial();
  const base = NODE_COLORS[kind];
  mat.diffuse = new pc.Color(
    Math.min(base.r * 1.4, 1),
    Math.min(base.g * 1.4, 1),
    Math.min(base.b * 1.4, 1),
  );
  mat.emissive = base.clone();
  mat.emissiveIntensity = 0.4;
  mat.metalness = 0.3;
  mat.gloss = 0.8;
  mat.update();
  materialCache.set(key, mat);
  return mat;
}

export function clearMaterialCache() {
  materialCache.clear();
}
