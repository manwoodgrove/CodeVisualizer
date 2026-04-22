import * as pc from 'playcanvas';

type PickHandler = (nodeId: string | null) => void;

export class PickManager {
  private app: pc.Application;
  private picker: pc.Picker;
  private camera: pc.CameraComponent;
  private nodeEntities: Map<string, pc.Entity>;
  private entityToId: Map<pc.Entity, string>;
  private handlers: PickHandler[] = [];
  private destroyed = false;

  private onPointerUp: (e: PointerEvent) => void;
  private canvas: HTMLCanvasElement;

  constructor(
    app: pc.Application,
    camera: pc.CameraComponent,
    nodeEntities: Map<string, pc.Entity>,
    entityToId: Map<pc.Entity, string>,
  ) {
    this.app    = app;
    this.camera = camera;
    this.nodeEntities = nodeEntities;
    this.entityToId   = entityToId;
    this.canvas = app.graphicsDevice.canvas as HTMLCanvasElement;

    const w = Math.max(1, Math.floor(this.canvas.width  / 4));
    const h = Math.max(1, Math.floor(this.canvas.height / 4));
    this.picker = new pc.Picker(app, w, h);

    this.onPointerUp = this.handlePointerUp.bind(this);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
  }

  onPick(handler: PickHandler): void {
    this.handlers.push(handler);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.destroyed) return;

    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x      = (e.clientX - rect.left) * scaleX;
    const y      = (e.clientY - rect.top)  * scaleY;

    // Quarter-resolution coordinates
    const px = Math.floor(x / 4);
    const py = Math.floor(y / 4);

    try {
      this.picker.prepare(this.camera, this.app.scene);
      const selection = this.picker.getSelection(px, py, 1, 1);

      if (selection.length === 0) {
        this.fire(null);
        return;
      }

      const picked = selection[0] as { node?: pc.Entity } | undefined;
      const node   = picked?.node;
      const nodeId = node ? this.resolveNodeId(node) : null;
      this.fire(nodeId);
    } catch {
      // Picker can fail if canvas is resized mid-frame
    }
  }

  private resolveNodeId(entity: pc.Entity): string | null {
    let current: pc.Entity | null = entity;
    while (current) {
      const id = this.entityToId.get(current);
      if (id !== undefined) return id;
      current = current.parent as pc.Entity | null;
    }
    return null;
  }

  private fire(nodeId: string | null): void {
    for (const h of this.handlers) h(nodeId);
  }

  /** Call when the canvas is resized to re-create the picker at correct resolution. */
  resize(): void {
    if (this.destroyed) return;
    const w = Math.max(1, Math.floor(this.canvas.width  / 4));
    const h = Math.max(1, Math.floor(this.canvas.height / 4));
    this.picker = new pc.Picker(this.app, w, h);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
  }
}
