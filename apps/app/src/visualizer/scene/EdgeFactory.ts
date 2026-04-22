import * as pc from 'playcanvas';
import type { GraphEdge, GraphNode } from '@codevisualizer/types';
import { getEdgeMaterial } from '../materials/edge-material.js';

const TUBE_SEGMENTS = 12;
const TUBE_RADIUS = 0.3;

export class EdgeFactory {
  private entityMap = new Map<string, pc.Entity>();
  private curveMap = new Map<string, pc.Vec3[]>();
  private app: pc.Application;
  private root: pc.Entity;

  constructor(app: pc.Application, root: pc.Entity) {
    this.app = app;
    this.root = root;
  }

  createEdge(edge: GraphEdge, srcNode: GraphNode, tgtNode: GraphNode): pc.Entity {
    const entity = new pc.Entity(`edge-${edge.id}`);

    const src = new pc.Vec3(srcNode.position3d.x, srcNode.position3d.y, srcNode.position3d.z);
    const tgt = new pc.Vec3(tgtNode.position3d.x, tgtNode.position3d.y, tgtNode.position3d.z);

    const curve = this.computeBezierCurve(src, tgt);
    this.curveMap.set(edge.id, curve);

    const mesh = this.buildTubeMesh(curve);
    entity.addComponent('model', { type: 'asset' });
    entity.model!.meshInstances = [new pc.MeshInstance(mesh, getEdgeMaterial(edge.kind))];

    this.root.addChild(entity);
    this.entityMap.set(edge.id, entity);
    return entity;
  }

  /** Cubic Bézier with perpendicular control points to avoid visual overlap */
  private computeBezierCurve(src: pc.Vec3, tgt: pc.Vec3, steps = 20): pc.Vec3[] {
    const mid = src.clone().add(tgt).mulScalar(0.5);
    const perp = new pc.Vec3(-(tgt.z - src.z), 0, tgt.x - src.x).normalize();
    const dist = src.distance(tgt);
    const offset = dist * 0.25;
    const cp1 = mid.clone().add(perp.clone().mulScalar(offset));
    const cp2 = mid.clone().add(perp.clone().mulScalar(-offset));

    const pts: pc.Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * src.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * tgt.x;
      const y = mt * mt * mt * src.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * tgt.y;
      const z = mt * mt * mt * src.z + 3 * mt * mt * t * cp1.z + 3 * mt * t * t * cp2.z + t * t * t * tgt.z;
      pts.push(new pc.Vec3(x, y, z));
    }
    return pts;
  }

  private buildTubeMesh(curve: pc.Vec3[]): pc.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < curve.length; i++) {
      const dir = i < curve.length - 1
        ? curve[i + 1].clone().sub(curve[i]).normalize()
        : curve[i].clone().sub(curve[i - 1]).normalize();

      const up = Math.abs(dir.y) < 0.99 ? pc.Vec3.UP : pc.Vec3.RIGHT;
      const right = new pc.Vec3().cross(up, dir).normalize();
      const actualUp = new pc.Vec3().cross(dir, right).normalize();

      for (let j = 0; j < TUBE_SEGMENTS; j++) {
        const angle = (j / TUBE_SEGMENTS) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = right.x * cos + actualUp.x * sin;
        const ny = right.y * cos + actualUp.y * sin;
        const nz = right.z * cos + actualUp.z * sin;
        positions.push(curve[i].x + nx * TUBE_RADIUS, curve[i].y + ny * TUBE_RADIUS, curve[i].z + nz * TUBE_RADIUS);
        normals.push(nx, ny, nz);
      }
    }

    for (let i = 0; i < curve.length - 1; i++) {
      for (let j = 0; j < TUBE_SEGMENTS; j++) {
        const a = i * TUBE_SEGMENTS + j;
        const b = i * TUBE_SEGMENTS + (j + 1) % TUBE_SEGMENTS;
        const c = (i + 1) * TUBE_SEGMENTS + j;
        const d = (i + 1) * TUBE_SEGMENTS + (j + 1) % TUBE_SEGMENTS;
        indices.push(a, c, b, b, c, d);
      }
    }

    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  }

  getCurve(edgeId: string): pc.Vec3[] | undefined {
    return this.curveMap.get(edgeId);
  }

  getEntity(edgeId: string): pc.Entity | undefined {
    return this.entityMap.get(edgeId);
  }

  setActive(edgeId: string, active: boolean, kind: GraphEdge['kind']) {
    const entity = this.entityMap.get(edgeId);
    if (!entity?.model) return;
    const mis = entity.model.meshInstances;
    if (!mis || mis.length === 0) return;
    mis[0].material = getEdgeMaterial(kind, active);
  }

  destroy() {
    for (const entity of this.entityMap.values()) entity.destroy();
    this.entityMap.clear();
    this.curveMap.clear();
  }
}
