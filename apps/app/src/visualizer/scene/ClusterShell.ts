import * as pc from 'playcanvas';
import type { GraphSnapshot } from '@cv/types';

// Spring constants extracted from manwoodgrove/entitytweening- PlayCanvasSpring.tsx
const STIFFNESS = 150.0;
const DAMPING = 12.0;

interface EntityPhysics {
  entity: pc.Entity;
  velocity: pc.Vec3;
  layoutPos: pc.Vec3;
  clusterCenter: pc.Vec3;
  currentTarget: pc.Vec3;
  intendedTarget: pc.Vec3;
  targetDelay: number;
}

interface ClusterData {
  items: EntityPhysics[];
}

/**
 * Manages cluster expand/collapse animations using spring physics.
 *
 * Physics pattern extracted from manwoodgrove/entitytweening- PlayCanvasSpring.tsx:
 * - Semi-implicit Euler integration (v then x)
 * - Staggered starts (15ms per node) for visual cascade
 * - Mid-animation reversal supported: velocity is preserved when target flips
 *
 * SceneManager wires:
 *   createShells(app, snapshot, nodeEntities, clusterRoot) after buildSnapshot
 *   syncExpanded(useGraphStore.getState().expandedClusters) in update loop
 *   update(dt) in update loop
 */
export class ClusterShell {
  private clusters = new Map<string, ClusterData>();
  private expanded = new Set<string>();

  // Reusable scratch vectors — avoid per-frame allocation
  private _tv = new pc.Vec3();
  private _cv = new pc.Vec3();
  private _dv = new pc.Vec3();
  private _sf = new pc.Vec3();
  private _df = new pc.Vec3();
  private _acc = new pc.Vec3();

  createShells(
    _app: pc.Application,
    snapshot: GraphSnapshot,
    nodeEntities: Map<string, pc.Entity>,
    _clusterRoot: pc.Entity,
  ): void {
    this.clusters.clear();
    this.expanded.clear();

    const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));

    for (const cluster of snapshot.clusters) {
      const center = new pc.Vec3(
        cluster.centroid3d.x,
        cluster.centroid3d.y,
        cluster.centroid3d.z,
      );

      const items: EntityPhysics[] = [];
      for (const nodeId of cluster.nodeIds) {
        const entity = nodeEntities.get(nodeId);
        const node = nodeById.get(nodeId);
        if (!entity || !node) continue;

        const layoutPos = new pc.Vec3(
          node.position3d.x,
          node.position3d.y,
          node.position3d.z,
        );
        // Initial state: nodes are already at layout positions (graph just rendered)
        items.push({
          entity,
          velocity: new pc.Vec3(),
          layoutPos,
          clusterCenter: center.clone(),
          currentTarget: layoutPos.clone(),
          intendedTarget: layoutPos.clone(),
          targetDelay: 0,
        });
      }

      this.clusters.set(cluster.id, { items });
    }
  }

  expand(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    data.items.forEach((item, i) => {
      item.targetDelay = i * 0.015;
      item.intendedTarget = item.layoutPos;
      if (item.targetDelay === 0) item.currentTarget.copy(item.layoutPos);
    });
  }

  collapse(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    const n = data.items.length;
    data.items.forEach((item, i) => {
      const stagger = (n - 1 - i) * 0.015;
      item.targetDelay = stagger;
      item.intendedTarget = item.clusterCenter;
      if (stagger === 0) item.currentTarget.copy(item.clusterCenter);
    });
  }

  /**
   * Diff the incoming expanded set against last known state and
   * call expand/collapse only for clusters that changed.
   * Safe to call every frame — only triggers animations on delta.
   */
  syncExpanded(ids: Set<string>): void {
    const toExpand   = [...ids].filter((id) => !this.expanded.has(id));
    const toCollapse = [...this.expanded].filter((id) => !ids.has(id));
    for (const id of toExpand)   this.expand(id);
    for (const id of toCollapse) this.collapse(id);
    this.expanded = new Set(ids);
  }

  update(dt: number): void {
    // Clamp to avoid physics explosion on lag spikes
    const clampedDt = Math.min(dt, 0.05);

    for (const { items } of this.clusters.values()) {
      for (const item of items) {
        if (item.targetDelay > 0) {
          item.targetDelay -= clampedDt;
          if (item.targetDelay <= 0) {
            item.currentTarget.copy(item.intendedTarget);
          }
        }

        const current = item.entity.getLocalPosition();
        this._cv.copy(current);
        this._tv.copy(item.currentTarget);

        // F_spring = -k(x - target)
        this._dv.sub2(this._cv, this._tv);
        this._sf.copy(this._dv).mulScalar(-STIFFNESS);

        // F_damp = -d * v
        this._df.copy(item.velocity).mulScalar(-DAMPING);

        // a = F / m  (m = 1)
        this._acc.add2(this._sf, this._df);

        // Semi-implicit Euler: v then x
        item.velocity.add(this._acc.clone().mulScalar(clampedDt));
        const nextPos = this._cv.clone().add(item.velocity.clone().mulScalar(clampedDt));
        item.entity.setLocalPosition(nextPos.x, nextPos.y, nextPos.z);
      }
    }
  }

  clear(): void {
    this.clusters.clear();
    this.expanded.clear();
  }
}
