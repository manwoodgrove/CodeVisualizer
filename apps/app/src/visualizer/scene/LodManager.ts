import * as pc from 'playcanvas';
import type { OrbitCameraState } from '../engine/camera.js';

// Thresholds mirrored from manwoodgrove/lod-system- PlayCanvasLOD.tsx
export const LABEL_LOD_SQ = 80 * 80;
export const EDGE_LOD_SQ = 200 * 200;

interface NodeRecord {
  nodeEntity: pc.Entity;
  labelEntity: pc.Entity;
}

interface EdgeRecord {
  tubeEntity: pc.Entity;
  lineEntity: pc.Entity;
  center: pc.Vec3;
}

/**
 * Per-frame distance-based LOD for nodes/labels and edges.
 *
 * Usage:
 *   // After scene is populated:
 *   lodManager.registerNode(id, nodeEnt, labelEnt);
 *   lodManager.registerEdge(id, tubeEnt, lineEnt, midpoint);
 *
 *   // Inside app.on('update'):
 *   lodManager.update();
 */
export class LodManager {
  private cameraState: OrbitCameraState;
  private nodes = new Map<string, NodeRecord>();
  private edges = new Map<string, EdgeRecord>();
  private _tmp = new pc.Vec3();

  constructor(_app: pc.Application, cameraState: OrbitCameraState) {
    this.cameraState = cameraState;
  }

  registerNode(nodeId: string, nodeEntity: pc.Entity, labelEntity: pc.Entity): void {
    this.nodes.set(nodeId, { nodeEntity, labelEntity });
  }

  registerEdge(
    edgeId: string,
    tubeEntity: pc.Entity,
    lineEntity: pc.Entity,
    center: pc.Vec3,
  ): void {
    this.edges.set(edgeId, { tubeEntity, lineEntity, center: center.clone() });
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  update(): void {
    const camPos = this.cameraState.entity.getPosition();

    for (const { nodeEntity, labelEntity } of this.nodes.values()) {
      const distSq = this._tmp.sub2(camPos, nodeEntity.getPosition()).lengthSq();
      const visible = distSq <= LABEL_LOD_SQ;
      if (labelEntity.enabled !== visible) {
        labelEntity.enabled = visible;
      }
    }

    for (const { tubeEntity, lineEntity, center } of this.edges.values()) {
      const distSq = this._tmp.sub2(camPos, center).lengthSq();
      const isFar = distSq > EDGE_LOD_SQ;
      if (tubeEntity.enabled === isFar) tubeEntity.enabled = !isFar;
      if (lineEntity.enabled !== isFar) lineEntity.enabled = isFar;
    }
  }
}
