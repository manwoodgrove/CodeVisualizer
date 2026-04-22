import * as pc from 'playcanvas';
import type { GraphNode, NodeKind } from '@codevisualizer/types';
import { getNodeMaterial, getHoverMaterial } from '../materials/node-material.js';

const NODE_SIZES: Record<NodeKind, (node: GraphNode) => number> = {
  MODULE:   (n) => Math.max(4, Math.min(12, n.metrics.linesOfCode / 100)),
  CLASS:    (n) => Math.max(3, Math.min(10, n.metrics.linesOfCode / 80)),
  FUNCTION: (n) => Math.max(2, Math.min(8, n.metrics.cyclomaticComplexity * 0.8)),
  METHOD:   (n) => Math.max(1.5, Math.min(6, n.metrics.linesOfCode / 40)),
  VARIABLE: () => 1.5,
};

export class NodeFactory {
  private entityMap = new Map<string, pc.Entity>();
  private app: pc.Application;
  private root: pc.Entity;

  constructor(app: pc.Application, root: pc.Entity) {
    this.app = app;
    this.root = root;
  }

  createNode(node: GraphNode): pc.Entity {
    const entity = new pc.Entity(node.name);
    const size = NODE_SIZES[node.kind](node);

    const mesh = this.createMesh(node.kind, size);
    entity.addComponent('model', { type: 'asset' });
    const mi = new pc.MeshInstance(mesh, getNodeMaterial(this.app, node.kind));
    entity.model!.meshInstances = [mi];

    // Sphere collision for picking (simpler than mesh collision)
    entity.addComponent('collision', { type: 'sphere', radius: size * 0.6 });

    entity.setPosition(node.position3d.x, node.position3d.y, node.position3d.z);

    // Label
    const label = this.createLabel(node.name, node.kind, size);
    entity.addChild(label);

    this.root.addChild(entity);
    this.entityMap.set(node.id, entity);
    return entity;
  }

  private createMesh(kind: NodeKind, size: number): pc.Mesh {
    const device = this.app.graphicsDevice;
    switch (kind) {
      case 'MODULE':   return pc.createBox(device, { halfExtents: new pc.Vec3(size, size * 0.3, size) });
      case 'CLASS':    return pc.createBox(device, { halfExtents: new pc.Vec3(size * 0.8, size * 0.8, size * 0.8) });
      case 'FUNCTION': return pc.createSphere(device, { radius: size });
      case 'METHOD':   return pc.createCapsule(device, { radius: size * 0.4, height: size });
      case 'VARIABLE': return pc.createSphere(device, { radius: size });
    }
  }

  private createLabel(name: string, kind: NodeKind, nodeSize: number): pc.Entity {
    const label = new pc.Entity('Label');
    label.addComponent('element', {
      type: pc.ELEMENTTYPE_TEXT,
      text: name.length > 20 ? name.slice(0, 18) + '…' : name,
      fontSize: 10,
      color: new pc.Color(0.9, 0.9, 1),
      anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
      pivot: new pc.Vec2(0.5, 0),
      width: 120,
      height: 20,
    });
    label.setLocalPosition(0, nodeSize + 1.5, 0);
    return label;
  }

  getEntity(nodeId: string): pc.Entity | undefined {
    return this.entityMap.get(nodeId);
  }

  setHover(nodeId: string, hover: boolean) {
    const entity = this.entityMap.get(nodeId);
    if (!entity || !entity.model) return;
    // Find the graph node kind from entity name - stored in user data
    const kind = (entity as unknown as { _nodeKind?: NodeKind })._nodeKind ?? 'FUNCTION';
    const mis = entity.model.meshInstances;
    if (!mis || mis.length === 0) return;
    mis[0].material = hover
      ? getHoverMaterial(this.app, kind)
      : getNodeMaterial(this.app, kind);
  }

  pulse(nodeId: string) {
    const entity = this.entityMap.get(nodeId);
    if (!entity) return;
    const orig = entity.getLocalScale().clone();
    const peak = orig.clone().mulScalar(1.4);
    const start = performance.now();
    const duration = 600;

    const animate = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      // ease out back
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const scale = t < 0.5
        ? pc.math.lerp(orig.x, peak.x, ease)
        : pc.math.lerp(peak.x, orig.x, (t - 0.5) * 2);
      entity.setLocalScale(scale, scale, scale);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  destroy() {
    for (const entity of this.entityMap.values()) entity.destroy();
    this.entityMap.clear();
  }
}
