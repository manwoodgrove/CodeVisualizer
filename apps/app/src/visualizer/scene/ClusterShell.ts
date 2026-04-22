import * as pc from 'playcanvas';
import type { GraphSnapshot } from '@cv/types';

const STIFFNESS = 150.0;
const DAMPING   = 12.0;

interface ClusterPhysicsEntry {
  entity: pc.Entity;
  layoutPos: pc.Vec3;
  currentTarget: pc.Vec3;
  velocity: pc.Vec3;
}

interface ClusterData {
  centroid: pc.Vec3;
  entries: ClusterPhysicsEntry[];
}

export class ClusterShell {
  private clusters = new Map<string, ClusterData>();

  constructor(_app?: pc.Application) {
    // app reserved for future use
  }

  register(
    snapshot: GraphSnapshot,
    nodeEntities: Map<string, pc.Entity>,
  ): void {
    this.clusters.clear();

    for (const cluster of snapshot.clusters) {
      const entries: ClusterPhysicsEntry[] = [];

      // Compute centroid from layout positions
      let cx = 0, cy = 0, cz = 0;
      let count = 0;

      for (const nodeId of cluster.nodeIds) {
        const entity = nodeEntities.get(nodeId);
        if (!entity) continue;
        const pos = entity.getPosition();
        cx += pos.x;
        cy += pos.y;
        cz += pos.z;
        count++;
      }

      const centroid = count > 0
        ? new pc.Vec3(cx / count, cy / count, cz / count)
        : new pc.Vec3(cluster.centroid3d.x, cluster.centroid3d.y, cluster.centroid3d.z);

      for (const nodeId of cluster.nodeIds) {
        const entity = nodeEntities.get(nodeId);
        if (!entity) continue;
        const layoutPos = entity.getPosition().clone();
        entries.push({
          entity,
          layoutPos,
          currentTarget: layoutPos.clone(), // default: expanded (at layout pos)
          velocity: new pc.Vec3(0, 0, 0),
        });
      }

      this.clusters.set(cluster.id, { centroid, entries });
    }
  }

  /** Expand cluster — move nodes back to their ForceAtlas2 layout positions. */
  expand(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    for (const entry of data.entries) {
      entry.currentTarget.copy(entry.layoutPos);
    }
  }

  /** Collapse cluster — pull all nodes toward cluster centroid. */
  collapse(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    for (const entry of data.entries) {
      entry.currentTarget.copy(data.centroid);
    }
  }

  /** Call each frame with dt in seconds. */
  update(dt: number): void {
    for (const data of this.clusters.values()) {
      for (const entry of data.entries) {
        const pos = entry.entity.getLocalPosition().clone();

        const toTarget = entry.currentTarget.clone().sub(pos);
        const spring   = toTarget.clone().mulScalar(STIFFNESS);
        const damp     = entry.velocity.clone().mulScalar(-DAMPING);

        const acc = spring.add(damp);
        entry.velocity.add(acc.mulScalar(dt));

        const newPos = pos.add(entry.velocity.clone().mulScalar(dt));
        entry.entity.setLocalPosition(newPos.x, newPos.y, newPos.z);
      }
    }
  }

  // Legacy signature kept so SceneManager.buildSnapshot compiles without changes
  createShells(
    _app: pc.Application,
    _snapshot: GraphSnapshot,
    _nodeEntities: Map<string, pc.Entity>,
    _parent: pc.Entity,
  ): void {
    // No-op: spring registration is done via register() from SceneManager
  }

  setVisible(_on: boolean): void {
    // No-op: spring system has no separate shell entity to show/hide
  }

  clear(): void {
    this.clusters.clear();
  }
}
