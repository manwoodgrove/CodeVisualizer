import * as pc from 'playcanvas';
import type { GraphSnapshot, EdgeKind } from '@cv/types';

function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

const EDGE_CONFIG: Record<EdgeKind, { radius: number; color: string }> = {
  IMPORT:      { radius: 0.08, color: '#6366F1' },
  CALL:        { radius: 0.10, color: '#06B6D4' },
  INHERITANCE: { radius: 0.18, color: '#F97316' },
  DATA_FLOW:   { radius: 0.09, color: '#EC4899' },
  EXPORT:      { radius: 0.07, color: '#9CA3AF' },
};

const TUBE_SEGMENTS = 16;
const TUBE_SIDES = 6;

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
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

function makeEdgeMaterial(colorHex: string): pc.StandardMaterial {
  const color = hexToColor(colorHex);
  const mat   = new pc.StandardMaterial();
  mat.diffuse  = color.clone();
  mat.emissive = new pc.Color(color.r * 0.15, color.g * 0.15, color.b * 0.15);
  mat.metalness     = 0.1;
  mat.useMetalness  = true;
  mat.update();
  return mat;
}

export class EdgeFactory {
  private app: pc.Application;
  private edgeEntities = new Map<string, pc.Entity>();
  private curvePoints  = new Map<string, pc.Vec3[]>();
  private edgeKinds    = new Map<string, EdgeKind>();
  private visibleKinds: Set<EdgeKind> = new Set([
    'IMPORT', 'CALL', 'INHERITANCE', 'DATA_FLOW', 'EXPORT',
  ]);
  private dashTexture: pc.Texture | null = null;
  private dataFlowMaterials: pc.StandardMaterial[] = [];

  constructor(app: pc.Application) {
    this.app = app;
  }

  private createDashTexture(): pc.Texture {
    // 1×32 vertical stripe texture: alternating pink (#EC4899) and dark-pink rows
    const width  = 1;
    const height = 32;
    const data   = new Uint8Array(width * height * 4);
    const pink   = [0xec, 0x48, 0x99, 0xff]; // #EC4899 fully opaque
    const dark   = [0x4a, 0x0a, 0x28, 0x30]; // dark/transparent filler

    for (let row = 0; row < height; row++) {
      const color = row < height / 2 ? pink : dark;
      const base  = row * width * 4;
      data[base + 0] = color[0];
      data[base + 1] = color[1];
      data[base + 2] = color[2];
      data[base + 3] = color[3];
    }

    const tex = new pc.Texture(this.app.graphicsDevice, {
      width,
      height,
      format: pc.PIXELFORMAT_RGBA8,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_REPEAT,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
    });
    tex.lock();
    const pixels = tex.lock() as Uint8Array;
    pixels.set(data);
    tex.unlock();
    return tex;
  }

  private makeDataFlowMaterial(): pc.StandardMaterial {
    if (!this.dashTexture) {
      this.dashTexture = this.createDashTexture();
    }
    const mat = new pc.StandardMaterial();
    mat.emissiveMap        = this.dashTexture;
    mat.emissiveMapTiling  = new pc.Vec2(1, 4);
    mat.emissiveMapOffset  = new pc.Vec2(0, 0);
    mat.emissive           = new pc.Color(1, 1, 1);
    mat.opacity            = 0.95;
    mat.blendType          = pc.BLEND_NORMAL;
    mat.useLighting        = false;
    mat.update();
    return mat;
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

      // Quadratic Bézier control point: midpoint lifted toward +Y
      const dist = src.distance(tgt);
      const ctrl = new pc.Vec3(
        (src.x + tgt.x) * 0.5,
        (src.y + tgt.y) * 0.5 + dist * 0.2,
        (src.z + tgt.z) * 0.5,
      );

      // Sample curve points
      const pts: pc.Vec3[] = [];
      for (let i = 0; i <= TUBE_SEGMENTS; i++) {
        pts.push(sampleBezier(src, ctrl, tgt, i / TUBE_SEGMENTS));
      }
      this.curvePoints.set(edge.id, pts);

      const cfg  = EDGE_CONFIG[edge.kind];
      const mesh = buildTubeMesh(this.app.graphicsDevice, pts, cfg.radius);

      let mat: pc.StandardMaterial;
      if (edge.kind === 'DATA_FLOW') {
        mat = this.makeDataFlowMaterial();
        this.dataFlowMaterials.push(mat);
      } else {
        mat = makeEdgeMaterial(cfg.color);
      }

      const entity = new pc.Entity(`edge:${edge.id}`);
      entity.addComponent('render', {
        meshInstances: [new pc.MeshInstance(mesh, mat)],
        castShadows:    false,
        receiveShadows: false,
      });
      entity.enabled = this.visibleKinds.has(edge.kind);
      parent.addChild(entity);
      this.edgeEntities.set(edge.id, entity);
    }

    return this.edgeEntities;
  }

  /** Call each frame with dt in seconds to animate DATA_FLOW edges. */
  update(dt: number): void {
    for (const mat of this.dataFlowMaterials) {
      const offset = mat.emissiveMapOffset;
      offset.y = (offset.y + dt * 0.8) % 1;
      // Reassign to signal the change to PlayCanvas
      mat.emissiveMapOffset = offset;
      mat.update();
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

  clear(): void {
    for (const entity of this.edgeEntities.values()) {
      entity.destroy();
    }
    this.edgeEntities.clear();
    this.curvePoints.clear();
    this.edgeKinds.clear();
    this.dataFlowMaterials = [];
  }
}
