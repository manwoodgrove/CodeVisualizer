import * as pc from 'playcanvas';
import type { CameraRig } from '../scene/CameraRig.js';

export class CameraAnimator {
  private rig: CameraRig;
  private getNodePos: (id: string) => pc.Vec3 | null;

  constructor(rig: CameraRig, getNodePos: (id: string) => pc.Vec3 | null) {
    this.rig = rig;
    this.getNodePos = getNodePos;
  }

  focusOnSet(nodeIds: string[], durMs = 800): void {
    if (nodeIds.length === 0) return;

    const positions: pc.Vec3[] = [];
    for (const id of nodeIds) {
      const p = this.getNodePos(id);
      if (p) positions.push(p);
    }
    if (positions.length === 0) return;

    // Compute centroid
    const centroid = new pc.Vec3(0, 0, 0);
    for (const p of positions) centroid.add(p);
    centroid.mulScalar(1 / positions.length);

    // Compute bounding radius
    let maxDist = 0;
    for (const p of positions) {
      const d = centroid.distance(p);
      if (d > maxDist) maxDist = d;
    }

    const distance = Math.max(50, maxDist * 2.5 + 30);
    this.rig.flyTo(centroid, distance, durMs);
  }

  focusOnNode(nodeId: string, durMs = 600): void {
    const pos = this.getNodePos(nodeId);
    if (!pos) return;
    this.rig.flyTo(pos, 80, durMs);
  }
}
