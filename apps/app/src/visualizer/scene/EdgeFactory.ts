import * as pc from 'playcanvas';
import type { GraphSnapshot, EdgeKind } from '@cv/types';

function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

// Neon edge palette. Colors picked to contrast with node kinds so that the
// "communication beams" read clearly against a colourful graph.
const EDGE_CONFIG: Record<EdgeKind, { radius: number; color: string; flowSpeed: number }> = {
  IMPORT:      { radius: 0.55, color: '#22D3FF', flowSpeed: 1.50 }, // cyan
  CALL:        { radius: 0.65, color: '#39FF7A', flowSpeed: 3.50 }, // green — fast
  INHERITANCE: { radius: 1.00, color: '#FFB648', flowSpeed: 0.80 }, // amber
  DATA_FLOW:   { radius: 0.60, color: '#F472FF', flowSpeed: 3.00 }, // magenta
  EXPORT:      { radius: 0.45, color: '#C4B5FD', flowSpeed: 0.70 }, // lilac
};

const TUBE_SEGMENTS = 20;
const TUBE_SIDES = 8;

/** Sample a quadratic Bézier at t ∈ [0,1] */
function sampleBezier(p0: pc.Vec3, p1: pc.Vec3, p2: pc.Vec3, t: number): pc.Vec3 {
  const mt = 1 - t;
  return new pc.Vec3(
    mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z,
  );
}

function buildTubeMesh(device: pc.GraphicsDevice, points: pc.Vec3[], radius: number): pc.Mesh {
  const sides = TUBE_SIDES;
  const segments = points.length;
  const vertsPerRing = sides;
  const totalVerts = segments * vertsPerRing;
  const totalTris = (segments - 1) * sides * 2;

  const positions = new Float32Array(totalVerts * 3);
  const normals   = new Float32Array(totalVerts * 3);
  const uvs       = new Float32Array(totalVerts * 2);
  const indices   = new Uint16Array(totalTris * 3);

  for (let si = 0; si < segments; si++) {
    // Tangent
    let tangent: pc.Vec3;
    if (si === 0) {
      tangent = new pc.Vec3().sub2(points[1], points[0]).normalize();
    } else if (si === segments - 1) {
      tangent = new pc.Vec3().sub2(points[si], points[si - 1]).normalize();
    } else {
      tangent = new pc.Vec3().sub2(points[si + 1], points[si - 1]).normalize();
    }

    // Build orthonormal frame
    const arbitrary = Math.abs(tangent.y) < 0.9
      ? new pc.Vec3(0, 1, 0)
      : new pc.Vec3(1, 0, 0);
    const binormal = new pc.Vec3().cross(tangent, arbitrary).normalize();
    const normal   = new pc.Vec3().cross(binormal, tangent).normalize();

    for (let vi = 0; vi < sides; vi++) {
      const angle = (vi / sides) * Math.PI * 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);

      const nx = normal.x * cos + binormal.x * sin;
      const ny = normal.y * cos + binormal.y * sin;
      const nz = normal.z * cos + binormal.z * sin;

      const vIdx = (si * vertsPerRing + vi) * 3;
      positions[vIdx + 0] = points[si].x + nx * radius;
      positions[vIdx + 1] = points[si].y + ny * radius;
      positions[vIdx + 2] = points[si].z + nz * radius;
      normals[vIdx + 0]   = nx;
      normals[vIdx + 1]   = ny;
      normals[vIdx + 2]   = nz;

      // UVs: U around circumference, V along length 0→1 (source→target)
      const uvIdx = (si * vertsPerRing + vi) * 2;
      uvs[uvIdx + 0] = vi / sides;
      uvs[uvIdx + 1] = si / (segments - 1);
    }
  }

  // Indices: connect consecutive rings
  let triIdx = 0;
  for (let si = 0; si < segments - 1; si++) {
    for (let vi = 0; vi < sides; vi++) {
      const a = si * vertsPerRing + vi;
      const b = si * vertsPerRing + (vi + 1) % sides;
      const c = (si + 1) * vertsPerRing + vi;
      const d = (si + 1) * vertsPerRing + (vi + 1) % sides;

      indices[triIdx++] = a;
      indices[triIdx++] = b;
      indices[triIdx++] = c;

      indices[triIdx++] = b;
      indices[triIdx++] = d;
      indices[triIdx++] = c;
    }
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

function buildLineMesh(device: pc.GraphicsDevice, src: pc.Vec3, tgt: pc.Vec3): pc.Mesh {
  const positions = new Float32Array([
    src.x, src.y, src.z,
    tgt.x, tgt.y, tgt.z,
  ]);
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.update(pc.PRIMITIVE_LINES);
  return mesh;
}

/**
 * Build a 1×N emissive-alpha texture containing two bright gaussian pulses.
 * Tiled along the edge's V axis + scrolled over time, this gives a clean
 * "packet flowing down a wire" effect for every edge.
 */
function createFlowTexture(device: pc.GraphicsDevice): pc.Texture {
  const width  = 1;
  const height = 128;
  const data   = new Uint8Array(width * height * 4);

  const pulses = [0.25, 0.75]; // two packets per tile
  const sigma  = 0.04;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    let intensity = 0.40; // base rail glow
    for (const c of pulses) {
      const d = v - c;
      intensity += Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    intensity = Math.min(1, intensity);
    const idx = y * 4;
    data[idx + 0] = 255;
    data[idx + 1] = 255;
    data[idx + 2] = 255;
    data[idx + 3] = Math.round(intensity * 255);
  }

  const tex = new pc.Texture(device, {
    width,
    height,
    format: pc.PIXELFORMAT_RGBA8,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
  });
  const pixels = tex.lock() as Uint8Array;
  pixels.set(data);
  tex.unlock();
  return tex;
}

function makeFlowMaterial(
  device: pc.GraphicsDevice,
  texture: pc.Texture,
  colorHex: string,
): pc.StandardMaterial {
  void device;
  const color = hexToColor(colorHex);
  const mat   = new pc.StandardMaterial();
  mat.diffuse            = new pc.Color(color.r * 0.4, color.g * 0.4, color.b * 0.4);
  mat.emissiveMap        = texture;
  mat.emissive           = color;
  mat.emissiveMapTiling  = new pc.Vec2(1, 2.5);
  mat.emissiveMapOffset  = new pc.Vec2(0, 0);
  mat.useLighting        = false;
  mat.blendType          = pc.BLEND_ADDITIVEALPHA;
  mat.depthWrite         = false;
  mat.update();
  return mat;
}

export interface EdgeLodRecord {
  edgeId: string;
  entity: pc.Entity;
  tubeMesh: pc.Mesh;
  lineMesh: pc.Mesh;
  meshInstance: pc.MeshInstance;
  midpoint: pc.Vec3;
}

interface FlowMatEntry {
  material: pc.StandardMaterial;
  speed: number;
}

export class EdgeFactory {
  private app: pc.Application;
  private edgeEntities = new Map<string, pc.Entity>();
  private curvePoints  = new Map<string, pc.Vec3[]>();
  private edgeKinds    = new Map<string, EdgeKind>();
  private visibleKinds: Set<EdgeKind> = new Set([
    'IMPORT', 'CALL', 'INHERITANCE', 'DATA_FLOW', 'EXPORT',
  ]);
  private flowTexture: pc.Texture | null = null;
  private flowMaterials: FlowMatEntry[] = [];
  private lodRecords: EdgeLodRecord[] = [];

  constructor(app: pc.Application) {
    this.app = app;
  }

  private getFlowTexture(): pc.Texture {
    if (!this.flowTexture) {
      this.flowTexture = createFlowTexture(this.app.graphicsDevice);
    }
    return this.flowTexture;
  }

  createEdges(
    snapshot: GraphSnapshot,
    nodeEntities: Map<string, pc.Entity>,
    parent: pc.Entity,
  ): Map<string, pc.Entity> {
    for (const edge of snapshot.edges) {
      const srcEntity = nodeEntities.get(edge.source);
      const tgtEntity = nodeEntities.get(edge.target);
      if (!srcEntity || !tgtEntity) continue;

      this.edgeKinds.set(edge.id, edge.kind);

      const src = srcEntity.getPosition();
      const tgt = tgtEntity.getPosition();

      // Quadratic Bézier control point: midpoint lifted high in +Y so that
      // edges arc cleanly over the ground plane (isometric-like look).
      const dist = src.distance(tgt);
      const arc  = Math.min(dist * 0.35, 60);
      const ctrl = new pc.Vec3(
        (src.x + tgt.x) * 0.5,
        (src.y + tgt.y) * 0.5 + arc,
        (src.z + tgt.z) * 0.5,
      );

      // Sample curve points
      const pts: pc.Vec3[] = [];
      for (let i = 0; i <= TUBE_SEGMENTS; i++) {
        pts.push(sampleBezier(src, ctrl, tgt, i / TUBE_SEGMENTS));
      }
      this.curvePoints.set(edge.id, pts);

      const cfg      = EDGE_CONFIG[edge.kind];
      const tubeMesh = buildTubeMesh(this.app.graphicsDevice, pts, cfg.radius);
      const lineMesh = buildLineMesh(this.app.graphicsDevice, src, tgt);

      const mat = makeFlowMaterial(this.app.graphicsDevice, this.getFlowTexture(), cfg.color);
      this.flowMaterials.push({ material: mat, speed: cfg.flowSpeed });

      const mi = new pc.MeshInstance(tubeMesh, mat);
      const entity = new pc.Entity(`edge:${edge.id}`);
      entity.addComponent('render', {
        meshInstances: [mi],
        castShadows:    false,
        receiveShadows: false,
      });
      entity.enabled = this.visibleKinds.has(edge.kind);
      parent.addChild(entity);
      this.edgeEntities.set(edge.id, entity);

      // Midpoint for LOD distance checks — use the arc apex so the edge stays
      // visible from typical camera angles looking down on the plane.
      const midpoint = new pc.Vec3(
        (src.x + tgt.x) * 0.5,
        (src.y + tgt.y) * 0.5 + arc * 0.5,
        (src.z + tgt.z) * 0.5,
      );
      this.lodRecords.push({ edgeId: edge.id, entity, tubeMesh, lineMesh, meshInstance: mi, midpoint });
    }

    return this.edgeEntities;
  }

  /** Call each frame with dt in seconds — scrolls the flow pulses. */
  update(dt: number): void {
    for (const { material, speed } of this.flowMaterials) {
      if (speed <= 0) continue;
      const offset = material.emissiveMapOffset;
      offset.y = (offset.y - dt * speed + 1) % 1;
      material.emissiveMapOffset = offset;
      material.update();
    }
  }

  setVisibleKinds(kinds: Set<EdgeKind>): void {
    this.visibleKinds = kinds;
    for (const [edgeId, entity] of this.edgeEntities) {
      const kind = this.edgeKinds.get(edgeId);
      if (kind !== undefined) {
        entity.enabled = kinds.has(kind);
      }
    }
  }

  getCurvePoints(edgeId: string): pc.Vec3[] | null {
    return this.curvePoints.get(edgeId) ?? null;
  }

  getLodRecords(): EdgeLodRecord[] {
    return this.lodRecords;
  }

  clear(): void {
    for (const entity of this.edgeEntities.values()) {
      entity.destroy();
    }
    this.edgeEntities.clear();
    this.curvePoints.clear();
    this.edgeKinds.clear();
    this.flowMaterials = [];
    this.lodRecords = [];
  }
}
