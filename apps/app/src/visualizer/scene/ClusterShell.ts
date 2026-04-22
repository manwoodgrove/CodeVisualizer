import * as pc from 'playcanvas';
import type { GraphSnapshot } from '@cv/types';

// Spring physics constants from the entitytweening- reference implementation.
const STIFFNESS = 150.0;
const DAMPING   = 12.0;
// Staggered starts between cluster members (seconds) for a cascade effect.
const STAGGER   = 0.015;
// Clamp per-frame dt to avoid spring explosion on stalls.
const DT_CLAMP  = 0.05;

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
 * Spring-driven expand/collapse for graph clusters. Semi-implicit Euler
 * integration; each node's target toggles between its ForceAtlas2 layout
 * position (expanded) and the cluster centroid (collapsed).
 *
 * API:
 *   register(snapshot, nodeEntities)  // call once after graph builds
 *   syncExpanded(ids)                 // every frame: diff vs last call
 *   update(dt)                        // every frame: spring step
 */
export class ClusterShell {
  private clusters = new Map<string, ClusterData>();
  private expanded = new Set<string>();

  // Scratch vectors — avoid per-frame allocation inside the inner loop.
  private _cv  = new pc.Vec3();
  private _tv  = new pc.Vec3();
  private _dv  = new pc.Vec3();
  private _sf  = new pc.Vec3();
  private _df  = new pc.Vec3();
  private _acc = new pc.Vec3();

  constructor(_app?: pc.Application) {
    // app param preserved for backward compat with existing SceneManager wiring
  }

  register(snapshot: GraphSnapshot, nodeEntities: Map<string, pc.Entity>): void {
    this.clusters.clear();
    this.expanded = new Set(snapshot.clusters.map((c) => c.id));

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

  /** Target = each node's original layout position (cascade from first → last). */
  expand(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    data.items.forEach((item, i) => {
      item.targetDelay    = i * STAGGER;
      item.intendedTarget = item.layoutPos;
      if (item.targetDelay === 0) item.currentTarget.copy(item.layoutPos);
    });
  }

  /** Target = cluster centroid (cascade from last → first for pull-in feel). */
  collapse(clusterId: string): void {
    const data = this.clusters.get(clusterId);
    if (!data) return;
    const n = data.items.length;
    data.items.forEach((item, i) => {
      const stagger = (n - 1 - i) * STAGGER;
      item.targetDelay    = stagger;
      item.intendedTarget = item.clusterCenter;
      if (stagger === 0) item.currentTarget.copy(item.clusterCenter);
    });
  }

  /** Diff the incoming set against the last known state; only animate deltas. */
  syncExpanded(ids: Set<string>): void {
    for (const id of ids) {
      if (!this.expanded.has(id)) this.expand(id);
    }
    for (const id of this.expanded) {
      if (!ids.has(id)) this.collapse(id);
    }
    this.expanded = new Set(ids);
  }

  update(dt: number): void {
    const clampedDt = Math.min(dt, DT_CLAMP);

    for (const { items } of this.clusters.values()) {
      for (const item of items) {
        if (item.targetDelay > 0) {
          item.targetDelay -= clampedDt;
          if (item.targetDelay <= 0) item.currentTarget.copy(item.intendedTarget);
        }

        const current = item.entity.getLocalPosition();
        this._cv.copy(current);
        this._tv.copy(item.currentTarget);

        // F_spring = -k (x - target)
        this._dv.sub2(this._cv, this._tv);
        this._sf.copy(this._dv).mulScalar(-STIFFNESS);

        // F_damp = -d v
        this._df.copy(item.velocity).mulScalar(-DAMPING);

        // a = F / m   (m = 1)
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
