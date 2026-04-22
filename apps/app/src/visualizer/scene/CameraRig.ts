import * as pc from 'playcanvas';
import type { Vec3 as CVec3 } from '@cv/types';

const MIN_DISTANCE = 30;
const MAX_DISTANCE = 2000;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraRig {
  readonly entity: pc.Entity;
  private camera: pc.CameraComponent;

  // Orbit state — default pitch angled down onto the plane so the grid and
  // arcing edges read like the reference isometric art.
  private focus = new pc.Vec3(0, 0, 0);
  private distance = 260;
  private yaw = 25;   // degrees
  private pitch = 38; // degrees

  // Fly-to tween state
  private tweening = false;
  private tweenElapsed = 0;
  private tweenDur = 0;
  private tweenStartFocus = new pc.Vec3();
  private tweenEndFocus = new pc.Vec3();
  private tweenStartDist = 300;
  private tweenEndDist = 300;

  // Input tracking
  private pointerDown = false;
  private rightDown = false;
  private lastX = 0;
  private lastY = 0;

  private canvas: HTMLCanvasElement;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onContextMenu: (e: Event) => void;
  private destroyed = false;

  constructor(app: pc.Application, parent: pc.Entity) {
    this.canvas = app.graphicsDevice.canvas as HTMLCanvasElement;

    this.entity = new pc.Entity('CameraRig');
    const cam = this.entity.addComponent('camera', {
      // Deep navy/indigo — the grid + node emissives pop against this.
      clearColor: new pc.Color(0.02, 0.025, 0.06, 1),
      fov: 50,
      farClip: 5000,
      nearClip: 0.5,
    }) as pc.CameraComponent;
    this.camera = cam;
    parent.addChild(this.entity);

    this.applyTransform();

    // Bind input handlers
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);
    this.onContextMenu = (e) => e.preventDefault();

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  get cameraComponent(): pc.CameraComponent {
    return this.camera;
  }

  setFocus(pos: CVec3 | pc.Vec3, distance?: number): void {
    this.focus.set(pos.x, pos.y, pos.z);
    if (distance !== undefined) {
      this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
    }
    this.tweening = false;
    this.applyTransform();
  }

  flyTo(target: pc.Vec3 | CVec3, distance: number, durMs: number): void {
    this.tweenStartFocus.copy(this.focus);
    this.tweenEndFocus.set(target.x, target.y, target.z);
    this.tweenStartDist = this.distance;
    this.tweenEndDist = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
    this.tweenElapsed = 0;
    this.tweenDur = durMs;
    this.tweening = true;
  }

  update(dt: number): void {
    if (this.destroyed) return;
    if (this.tweening) {
      this.tweenElapsed += dt * 1000;
      const t = Math.min(this.tweenElapsed / this.tweenDur, 1);
      const et = easeInOutCubic(t);

      this.focus.lerp(this.tweenStartFocus, this.tweenEndFocus, et);
      this.distance = this.tweenStartDist + (this.tweenEndDist - this.tweenStartDist) * et;

      if (t >= 1) this.tweening = false;
      this.applyTransform();
    }
  }

  private applyTransform(): void {
    const pitchRad = (this.pitch * Math.PI) / 180;
    const yawRad = (this.yaw * Math.PI) / 180;

    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);

    const offset = new pc.Vec3(
      this.distance * cosPitch * sinYaw,
      this.distance * sinPitch,
      this.distance * cosPitch * cosYaw,
    );

    const pos = new pc.Vec3().add2(this.focus, offset);
    this.entity.setPosition(pos.x, pos.y, pos.z);
    this.entity.lookAt(this.focus.x, this.focus.y, this.focus.z);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button === 2) {
      this.rightDown = true;
    } else {
      this.pointerDown = true;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  private handlePointerMove(e: PointerEvent): void {
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.pointerDown && e.button !== 2) {
      // Left drag: orbit
      this.tweening = false;
      this.yaw -= dx * 0.3;
      this.pitch = Math.max(-89, Math.min(89, this.pitch + dy * 0.3));
      this.applyTransform();
    } else if (this.rightDown) {
      // Right drag: pan
      this.tweening = false;
      const panScale = this.distance * 0.001;
      const right = new pc.Vec3();
      const up = new pc.Vec3();
      this.entity.getWorldTransform().getX(right);
      this.entity.getWorldTransform().getY(up);
      this.focus.add(right.mulScalar(-dx * panScale));
      this.focus.add(up.mulScalar(dy * panScale));
      this.applyTransform();
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button === 2) {
      this.rightDown = false;
    } else {
      this.pointerDown = false;
    }
  }

  private handleWheel(e: WheelEvent): void {
    this.tweening = false;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.distance * factor));
    this.applyTransform();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.entity.destroy();
  }
}
