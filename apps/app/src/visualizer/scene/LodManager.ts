import * as pc from 'playcanvas';

// Thresholds mirrored from manwoodgrove/lod-system- PlayCanvasLOD.tsx
export const LABEL_LOD_SQ = 80 * 80;
export const EDGE_LOD_SQ = 200 * 200;

/** Minimal camera interface satisfied by CameraRig (.entity is the camera pc.Entity). */
interface CameraRef {
  entity: pc.Entity;
}

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
 * Per-frame distance-based LOD for node labels and edges.
 *
 * Label threshold:  hide beyond 80 world units.
 * Edge threshold:   swap tube → line primitive beyond 200 world units.
 *
 * Pattern extracted from manwoodgrove/lod-system- PlayCanvasLOD.tsx.
 * Adapted: labels are pc.Entity (not DOM); two entity refs per edge
 * (tube + line) toggle enabled rather than swapping mesh pointers.
 */
export class LodManager {
  private cameraRef: CameraRef;
  private nodes = new Map<string, NodeRecord>();
  private edges = new Map<string, EdgeRecord>();
  private _tmp = new pc.Vec3();

  constructor(_app: pc.Application, cameraRef: CameraRef) {
    this.cameraRef = cameraRef;
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
    const camPos = this.cameraRef.entity.getPosition();

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
