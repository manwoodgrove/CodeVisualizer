import * as pc from 'playcanvas';
import type { GraphSnapshot, GraphCluster } from '@cv/types';

function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

function computeClusterRadius(
  cluster: GraphCluster,
  nodeEntities: Map<string, pc.Entity>,
): number {
  const centroid = new pc.Vec3(
    cluster.centroid3d.x,
    cluster.centroid3d.y,
    cluster.centroid3d.z,
  );
  let maxDist = 0;
  for (const nodeId of cluster.nodeIds) {
    const entity = nodeEntities.get(nodeId);
    if (!entity) continue;
    const pos  = entity.getPosition();
    const dist = centroid.distance(pos);
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist + 8;
}

export class ClusterShell {
  private shellEntities: pc.Entity[] = [];
  private visible = false;

  createShells(
    app: pc.Application,
    snapshot: GraphSnapshot,
    nodeEntities: Map<string, pc.Entity>,
    parent: pc.Entity,
  ): void {
    this.clear();

    for (const cluster of snapshot.clusters) {
      const radius = computeClusterRadius(cluster, nodeEntities);
      const color  = hexToColor(cluster.color);

      // Wireframe sphere — use a sphere mesh with a wireframe material
      const mesh = pc.createSphere(app.graphicsDevice, {
        radius,
        latitudeBands:  12,
        longitudeBands: 12,
      });

      const mat = new pc.StandardMaterial();
      mat.diffuse      = color.clone();
      mat.opacity      = 0.15;
      mat.blendType    = pc.BLEND_NORMAL;
      mat.depthWrite   = false;
      mat.cull         = pc.CULLFACE_NONE;
      mat.useLighting  = false;
      mat.update();

      const entity = new pc.Entity(`cluster:${cluster.id}`);
      entity.addComponent('render', {
        meshInstances: [new pc.MeshInstance(mesh, mat)],
        castShadows:    false,
        receiveShadows: false,
      });

      entity.setPosition(
        cluster.centroid3d.x,
        cluster.centroid3d.y,
        cluster.centroid3d.z,
      );
      entity.enabled = this.visible;
      parent.addChild(entity);
      this.shellEntities.push(entity);
    }
  }

  setVisible(on: boolean): void {
    this.visible = on;
    for (const e of this.shellEntities) e.enabled = on;
  }

  clear(): void {
    for (const e of this.shellEntities) e.destroy();
    this.shellEntities = [];
  }
}
