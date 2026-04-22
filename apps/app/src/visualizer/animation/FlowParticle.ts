import * as pc from 'playcanvas';

export class FlowParticle {
  private entity: pc.Entity;
  private points: pc.Vec3[];
  private durMs: number;
  private elapsed = 0;
  private destroyed = false;
  private app: pc.Application;

  constructor(app: pc.Application, parent: pc.Entity, points: pc.Vec3[], durMs = 800) {
    this.app = app;
    this.points = points;
    this.durMs = durMs;

    this.entity = new pc.Entity('FlowParticle');

    const mesh = pc.createSphere(app.graphicsDevice, { radius: 0.35, latitudeBands: 6, longitudeBands: 6 });
    const mat = new pc.StandardMaterial();
    mat.emissive = new pc.Color(0.0, 0.9, 1.0);
    mat.emissiveIntensity = 3.0;
    mat.useLighting = false;
    mat.update();

    const mr = this.entity.addComponent('render', {
      meshInstances: [new pc.MeshInstance(mesh, mat)],
      castShadows: false,
      receiveShadows: false,
    }) as pc.RenderComponent;
    void mr; // suppress unused

    parent.addChild(this.entity);
    this.setPosition(0);
  }

  private setPosition(t: number): void {
    if (this.points.length === 0) return;
    const pts = this.points;
    const n = pts.length - 1;
    const scaledT = Math.max(0, Math.min(1, t)) * n;
    const i = Math.min(Math.floor(scaledT), n - 1);
    const f = scaledT - i;
    const a = pts[i];
    const b = pts[Math.min(i + 1, n)];
    const pos = new pc.Vec3(
      a.x + (b.x - a.x) * f,
      a.y + (b.y - a.y) * f,
      a.z + (b.z - a.z) * f,
    );
    this.entity.setPosition(pos.x, pos.y, pos.z);
  }

  /** Returns true when the particle has completed its journey. */
  update(dt: number): boolean {
    if (this.destroyed) return true;
    this.elapsed += dt * 1000;
    const t = this.elapsed / this.durMs;
    this.setPosition(t);
    if (t >= 1) {
      this.destroy();
      return true;
    }
    return false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.entity.destroy();
  }
}
