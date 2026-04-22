import * as pc from 'playcanvas';
import type { GraphSnapshot, GraphNode, NodeKind } from '@cv/types';
import { createPulseMaterial } from './PulseMaterial.js';

function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

const NODE_COLORS: Record<NodeKind, string> = {
  MODULE:   '#1E3A8A',
  CLASS:    '#D97706',
  FUNCTION: '#059669',
  METHOD:   '#0891B2',
  VARIABLE: '#64748B',
};

function computeScale(node: GraphNode): number {
  const m = node.metrics;
  switch (node.kind) {
    case 'MODULE':   return 1.0 + m.linesOfCode / 200;
    case 'CLASS':    return 1.0 + m.linesOfCode / 150;
    case 'FUNCTION': return Math.max(0.4, Math.min(4, 0.6 + m.cyclomaticComplexity * 0.15));
    case 'METHOD':   return 0.5 + m.linesOfCode / 80;
    case 'VARIABLE': return 0.4;
  }
}

function buildMesh(
  app: pc.Application,
  node: GraphNode,
  baseScale: number,
): { mesh: pc.Mesh; entityScale: pc.Vec3 } {
  const s = baseScale;
  switch (node.kind) {
    case 'MODULE':
      return {
        mesh: pc.createBox(app.graphicsDevice, { halfExtents: new pc.Vec3(0.5, 0.5, 0.5) }),
        entityScale: new pc.Vec3(s * 1.2, s * 1.4, s * 1.2),
      };
    case 'CLASS':
      return {
        mesh: pc.createBox(app.graphicsDevice, { halfExtents: new pc.Vec3(0.5, 0.5, 0.5) }),
        entityScale: new pc.Vec3(s, s, s),
      };
    case 'FUNCTION':
      return {
        mesh: pc.createSphere(app.graphicsDevice, { radius: 0.5 }),
        entityScale: new pc.Vec3(s, s, s),
      };
    case 'METHOD':
      return {
        mesh: pc.createCapsule(app.graphicsDevice, { radius: 0.3, height: 1.0 }),
        entityScale: new pc.Vec3(s, s, s),
      };
    case 'VARIABLE':
      return {
        mesh: pc.createCone(app.graphicsDevice, { baseRadius: 0.4, peakRadius: 0, height: 0.8 }),
        entityScale: new pc.Vec3(s, s, s),
      };
  }
}

interface NodeData {
  entity: pc.Entity;
  baseScale: pc.Vec3;
  material: pc.StandardMaterial;
  meshInstance: pc.MeshInstance;
  colorHex: string;
  pulseActive: boolean;
  pulseElapsed: number;
  pulseDur: number;
  highlighted: boolean;
}

export class NodeFactory {
  private app: pc.Application;
  private nodeMap = new Map<string, NodeData>();
  private entityToId = new Map<pc.Entity, string>();
  private shaderTime = 0;

  constructor(app: pc.Application) {
    this.app = app;
  }

  createNodes(
    snapshot: GraphSnapshot,
    parent: pc.Entity,
    fontAsset?: pc.Asset,
  ): Map<string, pc.Entity> {
    const entityMap = new Map<string, pc.Entity>();

    for (const node of snapshot.nodes) {
      const colorHex = NODE_COLORS[node.kind];
      const baseScale = computeScale(node);
      const { mesh, entityScale } = buildMesh(this.app, node, baseScale);
      const mat = createPulseMaterial(hexToColor(colorHex));

      const mi = new pc.MeshInstance(mesh, mat);
      const entity = new pc.Entity(`node:${node.id}`);
      entity.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: true,
      });

      entity.setLocalPosition(node.position3d.x, node.position3d.y, node.position3d.z);
      entity.setLocalScale(entityScale.x, entityScale.y, entityScale.z);

      parent.addChild(entity);

      this.addLabel(entity, node.name, baseScale, fontAsset);

      const data: NodeData = {
        entity,
        baseScale: entityScale.clone(),
        material: mat,
        meshInstance: mi,
        colorHex,
        pulseActive: false,
        pulseElapsed: 0,
        pulseDur: 600,
        highlighted: false,
      };
      this.nodeMap.set(node.id, data);
      this.entityToId.set(entity, node.id);
      entityMap.set(node.id, entity);
    }

    return entityMap;
  }

  private addLabel(
    parent: pc.Entity,
    name: string,
    baseScale: number,
    fontAsset?: pc.Asset,
  ): void {
    if (!fontAsset) return;

    const label = new pc.Entity('label');
    label.addComponent('element', {
      type: pc.ELEMENTTYPE_TEXT,
      text: name,
      fontAsset: fontAsset.id,
      fontSize: 12,
      color: new pc.Color(1, 1, 1),
      anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
      pivot: new pc.Vec2(0.5, 0.5),
      autoWidth: true,
      autoHeight: true,
    });
    label.setLocalPosition(0, baseScale + 0.5, 0);
    parent.addChild(label);
  }

  setHighlight(nodeId: string, on: boolean): void {
    const data = this.nodeMap.get(nodeId);
    if (!data) return;
    data.highlighted = on;
    // Pulse shader owns emissive; highlight is communicated via scale only
    if (on) {
      data.entity.setLocalScale(
        data.baseScale.x * 1.4,
        data.baseScale.y * 1.4,
        data.baseScale.z * 1.4,
      );
    } else {
      data.entity.setLocalScale(data.baseScale.x, data.baseScale.y, data.baseScale.z);
    }
  }

  pulse(nodeId: string, durMs: number): void {
    const data = this.nodeMap.get(nodeId);
    if (!data) return;
    data.pulseActive = true;
    data.pulseElapsed = 0;
    data.pulseDur = durMs;
    // Activate shader-driven pulse on this node's mesh instance
    data.meshInstance.setParameter('uPulseActive', 1.0);
  }

  update(dt: number): void {
    this.shaderTime += dt;

    for (const data of this.nodeMap.values()) {
      // Advance global time uniform on every material each frame
      data.material.setParameter('uTime', this.shaderTime);

      if (!data.pulseActive) continue;

      data.pulseElapsed += dt * 1000;
      const t = Math.min(data.pulseElapsed / data.pulseDur, 1);

      if (t >= 1) {
        data.pulseActive = false;
        // Deactivate shader pulse and restore base scale
        data.meshInstance.setParameter('uPulseActive', 0.0);
        if (!data.highlighted) {
          data.entity.setLocalScale(data.baseScale.x, data.baseScale.y, data.baseScale.z);
        }
      }
    }
  }

  updateLabels(camera: pc.Entity): void {
    const camPos = camera.getPosition();

    for (const data of this.nodeMap.values()) {
      const labelEntity = data.entity.findByName('label');
      if (!labelEntity) continue;

      const nodePos = data.entity.getPosition();
      const dist = camPos.distance(nodePos);
      const visible = dist < 800;

      labelEntity.lookAt(camPos.x, camPos.y, camPos.z);
      const euler = labelEntity.getLocalEulerAngles();
      labelEntity.setLocalEulerAngles(euler.x, euler.y + 180, euler.z);

      // LodManager overrides this with a tighter 80u threshold when wired in.
      // NodeFactory keeps 800u as the outer fallback.
      labelEntity.enabled = visible;
    }
  }

  getEntityId(entity: pc.Entity): string | undefined {
    return this.entityToId.get(entity);
  }

  getEntityMap(): Map<string, pc.Entity> {
    const map = new Map<string, pc.Entity>();
    for (const [id, data] of this.nodeMap) {
      map.set(id, data.entity);
    }
    return map;
  }

  getPosition(nodeId: string): pc.Vec3 | null {
    const data = this.nodeMap.get(nodeId);
    if (!data) return null;
    return data.entity.getPosition().clone();
  }

  clear(): void {
    for (const data of this.nodeMap.values()) {
      data.entity.destroy();
    }
    this.nodeMap.clear();
    this.entityToId.clear();
    this.shaderTime = 0;
  }
}
