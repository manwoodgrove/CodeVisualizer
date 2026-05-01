import * as pc from 'playcanvas';
import type { GraphSnapshot, EdgeKind } from '@cv/types';
import { hexToColor } from '../../utils/color.js';

// Saturated neon edge palette. Each kind reads as a distinct "wire" running
// between nodes. Colors are pushed slightly toward 1.0 so additive blending
// keeps them readable against the dark background.
const EDGE_CONFIG: Record<
  EdgeKind,
  { radius: number; color: string; flowSpeed: number; intensity: number }
> = {
  IMPORT:      { radius: 0.85, color: '#22D3FF', flowSpeed: 1.40, intensity: 1.6 }, // cyan
  CALL:        { radius: 0.95, color: '#39FF7A', flowSpeed: 3.20, intensity: 1.7 }, // green — fast
  INHERITANCE: { radius: 1.30, color: '#FFB648', flowSpeed: 0.70, intensity: 1.4 }, // amber
  DATA_FLOW:   { radius: 0.90, color: '#F472FF', flowSpeed: 2.80, intensity: 1.7 }, // magenta
  EXPORT:      { radius: 0.75, color: '#C4B5FD', flowSpeed: 0.65, intensity: 1.3 }, // lilac
};

const TUBE_SEGMENTS = 36;
const TUBE_SIDES = 8;

// Visual lift for the bezier control point — a touch higher than before so
// the arcs read clearly as "wires hanging between buildings" against the
// dark plane.
const ARC_FACTOR = 0.45;
const ARC_MAX = 90;

/** Sample a quadratic Bézier at t ∈ [0,1] */
function sampleBezier(p0: pc.Vec3, p1: pc.Vec3, p2: pc.Vec3, t: number): pc.Vec3 {
  const mt = 1 - t;
  return new pc.Vec3(
    mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z,
  );
}

/**
 * Build a tube mesh with per-vertex V coordinate matching arc-length along
 * the curve. We also pack a per-vertex alpha-fade into UV0.x so the shader
 * can soften the endpoints (so edges visually merge into the nodes rather
 * than abruptly clipping into them).
 */
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

  // Stable up vector — using a simple non-axis-aligned reference avoids the
  // tube "flipping" at vertical sections.
  const reference = new pc.Vec3(0.001, 1.0, 0.0).normalize();

  // Track binormal across rings to prevent twist (parallel transport frame).
  let lastBinormal: pc.Vec3 | null = null;

  for (let si = 0; si < segments; si++) {
    let tangent: pc.Vec3;
    if (si === 0) {
      tangent = new pc.Vec3().sub2(points[1], points[0]).normalize();
    } else if (si === segments - 1) {
      tangent = new pc.Vec3().sub2(points[si], points[si - 1]).normalize();
    } else {
      tangent = new pc.Vec3().sub2(points[si + 1], points[si - 1]).normalize();
    }

    let binormal: pc.Vec3;
    if (!lastBinormal) {
      binormal = new pc.Vec3().cross(tangent, reference).normalize();
      if (binormal.length() < 0.01) {
        binormal = new pc.Vec3().cross(tangent, new pc.Vec3(1, 0, 0)).normalize();
      }
    } else {
      // Project last binormal onto plane perpendicular to current tangent.
      const dotTB = lastBinormal.dot(tangent);
      binormal = new pc.Vec3(
        lastBinormal.x - tangent.x * dotTB,
        lastBinormal.y - tangent.y * dotTB,
        lastBinormal.z - tangent.z * dotTB,
      ).normalize();
    }
    lastBinormal = binormal.clone();

    const normal = new pc.Vec3().cross(binormal, tangent).normalize();

    // Smooth taper at each end — so the tube emerges from / merges into the
    // node rather than terminating abruptly.
    const tNorm = si / (segments - 1);
    const taper = Math.min(1, Math.min(tNorm, 1 - tNorm) * 6.0);
    const r = radius * (0.35 + 0.65 * taper);

    for (let vi = 0; vi < sides; vi++) {
      const angle = (vi / sides) * Math.PI * 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);

      const nx = normal.x * cos + binormal.x * sin;
      const ny = normal.y * cos + binormal.y * sin;
      const nz = normal.z * cos + binormal.z * sin;

      const vIdx = (si * vertsPerRing + vi) * 3;
      positions[vIdx + 0] = points[si].x + nx * r;
      positions[vIdx + 1] = points[si].y + ny * r;
      positions[vIdx + 2] = points[si].z + nz * r;
      normals[vIdx + 0]   = nx;
      normals[vIdx + 1]   = ny;
      normals[vIdx + 2]   = nz;

      // U: alpha-fade weight (0 at endpoints, 1 in middle).
      // V: arc-length parameter (0→1, source→target).
      const uvIdx = (si * vertsPerRing + vi) * 2;
      uvs[uvIdx + 0] = taper;
      uvs[uvIdx + 1] = tNorm;
    }
  }

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
 * 1×N flow texture: a constant rail (so the wire is always visible) plus
 * three sharp gaussian pulses that scroll. The new texture is brighter at
 * the pulse peaks and uses a wider asymmetric tail so packets read as
 * comet-style streaks instead of plain dots.
 */
function createFlowTexture(device: pc.GraphicsDevice): pc.Texture {
  const width  = 1;
  const height = 256;
  const data   = new Uint8Array(width * height * 4);

  const pulses = [0.15, 0.50, 0.82];

  for (let y = 0; y < height; y++) {
    const v = y / height;

    // Base rail glow — visible always.
    let intensity = 0.55;

    // Comet pulses with sharp head + long tail (asymmetric gaussian).
    for (const c of pulses) {
      let d = v - c;
      // Wrap distance for seamless tiling
      if (d >  0.5) d -= 1;
      if (d < -0.5) d += 1;
      const sigma = d > 0 ? 0.012 : 0.055; // tight head, long trailing tail
      intensity += Math.exp(-(d * d) / (2 * sigma * sigma)) * 1.4;
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

/**
 * Custom emissive chunk for edges. Combines:
 *   - the scrolling flow texture (sampled along V)
 *   - a per-vertex endpoint fade (carried in UV0.x)
 *   - a global breathing pulse synced to uTime
 *   - a subtle fresnel falloff so the edge "rim" is brightest when seen
 *     edge-on, giving the tube a glassy neon-tube feel
 */
const EDGE_EMISSIVE_PS = /* glsl */ `
  uniform sampler2D texture_emissiveMap;
  uniform vec3  material_emissive;
  uniform vec2  material_emissiveMapTiling;
  uniform vec2  material_emissiveMapOffset;
  uniform float uEdgeIntensity;
  uniform float uEdgeTime;
  uniform float uEdgePulsePhase;

  void getEmission() {
      vec2 uv = vUv0 * material_emissiveMapTiling + material_emissiveMapOffset;
      vec4 flow = texture2D(texture_emissiveMap, uv);

      // Per-vertex endpoint fade (UV.x packs taper 0..1; squaring softens it).
      float endpointFade = smoothstep(0.0, 0.5, vUv0.x);

      // Subtle global breathing — slightly different phase per edge so the
      // network doesn't strobe in unison.
      float breathe = 0.85 + 0.30 * sin(uEdgeTime * 1.7 + uEdgePulsePhase);

      // Fresnel rim: brightest along silhouette
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(view_position - vPositionW);
      float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
      float fresnel = pow(1.0 - ndotv, 1.4);

      float intensity = (flow.a + 0.10) * uEdgeIntensity * breathe * endpointFade;
      intensity *= (0.55 + 0.65 * fresnel);

      dEmission = material_emissive * intensity;
  }
`;

function makeFlowMaterial(
  device: pc.GraphicsDevice,
  texture: pc.Texture,
  colorHex: string,
  intensity: number,
  phase: number,
): pc.StandardMaterial {
  void device;
  const color = hexToColor(colorHex);
  const mat   = new pc.StandardMaterial();
  mat.diffuse            = new pc.Color(0, 0, 0);
  mat.emissiveMap        = texture;
  mat.emissive           = color;
  mat.emissiveMapTiling  = new pc.Vec2(1, 2.0);
  mat.emissiveMapOffset  = new pc.Vec2(0, 0);
  mat.useLighting        = false;
  mat.blendType          = pc.BLEND_ADDITIVEALPHA;
  mat.depthWrite         = false;
  mat.cull               = pc.CULLFACE_NONE;

  (mat.chunks as Record<string, string>).emissivePS = EDGE_EMISSIVE_PS;

  mat.setParameter('uEdgeIntensity',   intensity);
  mat.setParameter('uEdgeTime',        0.0);
  mat.setParameter('uEdgePulsePhase',  phase);

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
  private allMaterials: pc.StandardMaterial[] = [];
  private lodRecords: EdgeLodRecord[] = [];
  private edgeTime = 0;

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
    let phaseCounter = 0;

    for (const edge of snapshot.edges) {
      const srcEntity = nodeEntities.get(edge.source);
      const tgtEntity = nodeEntities.get(edge.target);
      if (!srcEntity || !tgtEntity) continue;

      this.edgeKinds.set(edge.id, edge.kind);

      const src = srcEntity.getPosition();
      const tgt = tgtEntity.getPosition();

      const dist = src.distance(tgt);
      const arc  = Math.min(dist * ARC_FACTOR, ARC_MAX);
      const ctrl = new pc.Vec3(
        (src.x + tgt.x) * 0.5,
        (src.y + tgt.y) * 0.5 + arc,
        (src.z + tgt.z) * 0.5,
      );

      const pts: pc.Vec3[] = [];
      for (let i = 0; i <= TUBE_SEGMENTS; i++) {
        pts.push(sampleBezier(src, ctrl, tgt, i / TUBE_SEGMENTS));
      }
      this.curvePoints.set(edge.id, pts);

      const cfg      = EDGE_CONFIG[edge.kind];
      const tubeMesh = buildTubeMesh(this.app.graphicsDevice, pts, cfg.radius);
      const lineMesh = buildLineMesh(this.app.graphicsDevice, src, tgt);

      // Slight phase per edge so breathing doesn't strobe in unison.
      const phase = (phaseCounter++ * 0.91) % (Math.PI * 2);

      const mat = makeFlowMaterial(
        this.app.graphicsDevice,
        this.getFlowTexture(),
        cfg.color,
        cfg.intensity,
        phase,
      );
      this.flowMaterials.push({ material: mat, speed: cfg.flowSpeed });
      this.allMaterials.push(mat);

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

      const midpoint = new pc.Vec3(
        (src.x + tgt.x) * 0.5,
        (src.y + tgt.y) * 0.5 + arc * 0.5,
        (src.z + tgt.z) * 0.5,
      );
      this.lodRecords.push({ edgeId: edge.id, entity, tubeMesh, lineMesh, meshInstance: mi, midpoint });
    }

    return this.edgeEntities;
  }

  /** Call each frame with dt in seconds — scrolls the flow pulses + ticks shader time. */
  update(dt: number): void {
    this.edgeTime += dt;

    for (const { material, speed } of this.flowMaterials) {
      if (speed > 0) {
        const offset = material.emissiveMapOffset;
        offset.y = (offset.y - dt * speed + 1) % 1;
        material.emissiveMapOffset = offset;
      }
      material.setParameter('uEdgeTime', this.edgeTime);
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
    this.allMaterials = [];
    this.lodRecords = [];
  }
}
