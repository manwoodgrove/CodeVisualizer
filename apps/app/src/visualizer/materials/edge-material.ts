import * as pc from 'playcanvas';
import type { EdgeKind } from '@codevisualizer/types';
import { EDGE_COLORS, ACTIVE_COLOR } from './palette.js';

const materialCache = new Map<string, pc.StandardMaterial>();

export function getEdgeMaterial(kind: EdgeKind, active = false): pc.StandardMaterial {
  const key = `${kind}_${active}`;
  if (materialCache.has(key)) return materialCache.get(key)!;

  const mat = new pc.StandardMaterial();
  const base = active ? ACTIVE_COLOR : EDGE_COLORS[kind];
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = base.clone();
  mat.emissiveIntensity = active ? 2.5 : 1.0;
  mat.opacity = active ? 1.0 : 0.7;
  mat.blendType = active ? pc.BLEND_NONE : pc.BLEND_NORMAL;
  mat.depthWrite = !active;
  mat.update();
  materialCache.set(key, mat);
  return mat;
}

export function getParticleMaterial(): pc.StandardMaterial {
  const key = 'particle';
  if (materialCache.has(key)) return materialCache.get(key)!;

  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0, 0, 0);
  mat.emissive = ACTIVE_COLOR.clone();
  mat.emissiveIntensity = 3;
  mat.update();
  materialCache.set(key, mat);
  return mat;
}
