import * as pc from 'playcanvas';

const LABEL_LOD_SQ = 80 * 80;
const EDGE_LOD_SQ  = 200 * 200;

interface NodeLodEntry {
  nodeId: string;
  nodeEntity: pc.Entity;
  labelEntity: pc.Entity | null;
}

interface EdgeLodEntry {
  edgeId: string;
  entity: pc.Entity;
  tubeMesh: pc.Mesh;
  lineMesh: pc.Mesh;
  meshInstance: pc.MeshInstance;
  midpoint: pc.Vec3;
}

export class LodManager {
  private camera: pc.Entity;
  private nodeEntries: NodeLodEntry[] = [];
  private edgeEntries: EdgeLodEntry[] = [];

  constructor(camera: pc.Entity) {
    this.camera = camera;
  }

  registerNode(
    nodeId: string,
    nodeEntity: pc.Entity,
    labelEntity: pc.Entity | null,
  ): void {
    this.nodeEntries.push({ nodeId, nodeEntity, labelEntity });
  }

  registerEdge(
    edgeId: string,
    entity: pc.Entity,
    tubeMesh: pc.Mesh,
    lineMesh: pc.Mesh,
    meshInstance: pc.MeshInstance,
    midpoint: pc.Vec3,
  ): void {
    this.edgeEntries.push({ edgeId, entity, tubeMesh, lineMesh, meshInstance, midpoint });
  }

  update(): void {
    const camPos = this.camera.getPosition();

    // Label LOD
    for (const entry of this.nodeEntries) {
      if (!entry.labelEntity) continue;
      const lp = entry.labelEntity.getPosition();
      const dx = lp.x - camPos.x;
      const dy = lp.y - camPos.y;
      const dz = lp.z - camPos.z;
      const sqDist = dx * dx + dy * dy + dz * dz;
      entry.labelEntity.enabled = sqDist < LABEL_LOD_SQ;
    }

    // Edge LOD: swap between tube and line mesh based on distance
    for (const entry of this.edgeEntries) {
      const mp = entry.midpoint;
      const dx = mp.x - camPos.x;
      const dy = mp.y - camPos.y;
      const dz = mp.z - camPos.z;
      const sqDist = dx * dx + dy * dy + dz * dz;
      entry.meshInstance.mesh = sqDist > EDGE_LOD_SQ ? entry.lineMesh : entry.tubeMesh;
    }
  }

  clear(): void {
    this.nodeEntries = [];
    this.edgeEntries = [];
  }
}
