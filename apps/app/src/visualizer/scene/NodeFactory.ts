import * as pc from 'playcanvas';
import type { GraphSnapshot, GraphNode, NodeKind } from '@cv/types';
import { createPulseMaterial } from './PulseMaterial.js';

// Hex color string → pc.Color
function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

const NODE_COLORS: Record<NodeKind, string> = {
  MODULE: '#1E3A8A',
  CLASS: '#D97706',
  FUNCTION: '#059669',
  METHOD: '#0891B2',
  VARIABLE: '#64748B',
};

function computeScale(node: GraphNode): number {
  const m = node.metrics;
  switch (node.kind) {
    case 'MODULE':
      return 1.0 + m.linesOfCode / 200;
    case 'CLASS':
      return 1.0 + m.linesOfCode / 150;
    case 'FUNCTION':
      return Math.max(0.4, Math.min(4, 0.6 + m.cyclomaticComplexity * 0.15));
    case 'METHOD':
      return 0.5 + m.linesOfCode / 80;
    case 'VARIABLE':
      return 0.4;
  }
}

function buildMesh(app: pc.Application, node: GraphNode, baseScale: number): { mesh: pc.Mesh; entityScale: pc.Vec3 } {
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

function makeMaterial(app: pc.Application, colorHex: string): pc.StandardMaterial {
  const color = hexToColor(colorHex);
  return createPulseMaterial(app, color);
}

interface NodeData {
  entity: pc.Entity;
  baseScale: pc.Vec3;
  material: pc.StandardMaterial;
  colorHex: string;
  // Pulse tween state
  pulseActive: boolean;
  pulseElapsed: number;
  pulseDur: number;
  // Highlight state
  highlighted: boolean;
}

export class NodeFactory {
  private app: pc.Application;
  private nodeMap = new Map<string, NodeData>();
  private entityToId = new Map<pc.Entity, string>();

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
      const mat = makeMaterial(this.app, colorHex);

      const entity = new pc.Entity(`node:${node.id}`);
      entity.addComponent('render', {
        meshInstances: [new pc.MeshInstance(mesh, mat)],
        castShadows: false,
        receiveShadows: true,
      });

      entity.setLocalPosition(node.position3d.x, node.position3d.y, node.position3d.z);
      entity.setLocalScale(entityScale.x, entityScale.y, entityScale.z);

      parent.addChild(entity);

      // Attach label — requires a valid font asset
      this.addLabel(entity, node.name, baseScale, fontAsset);

      const data: NodeData = {
        entity,
        baseScale: entityScale.clone(),
        material: mat,
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
    const color = hexToColor(data.colorHex);
    if (on) {
      data.material.setParameter('u_baseEmissive', [color.r * 0.6, color.g * 0.6, color.b * 0.6]);
      data.entity.setLocalScale(
        data.baseScale.x * 1.4,
        data.baseScale.y * 1.4,
        data.baseScale.z * 1.4,
      );
    } else {
      data.material.setParameter('u_baseEmissive', [color.r * 0.1, color.g * 0.1, color.b * 0.1]);
      data.entity.setLocalScale(data.baseScale.x, data.baseScale.y, data.baseScale.z);
    }
  }

  pulse(nodeId: string, durMs: number): void {
    const data = this.nodeMap.get(nodeId);
    if (!data) return;
    data.pulseActive = true;
    data.pulseElapsed = 0;
    data.pulseDur = durMs;
  }

  /** Call each frame with dt in seconds. */
  update(dt: number): void {
    for (const data of this.nodeMap.values()) {
      if (!data.pulseActive) continue;
      data.pulseElapsed += dt * 1000;
      const t = Math.min(data.pulseElapsed / data.pulseDur, 1);

      // Triangle wave: 0→1→0
      const wave = t < 0.5 ? t * 2 : (1 - t) * 2;
      const scaleBoost = 1 + wave * 0.4; // 1x to 1.4x

      if (!data.highlighted) {
        data.entity.setLocalScale(
          data.baseScale.x * scaleBoost,
          data.baseScale.y * scaleBoost,
          data.baseScale.z * scaleBoost,
        );
      }

      if (t >= 1) {
        data.pulseActive = false;
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

      labelEntity.enabled = visible;
    }
  }

  getMaterials(): pc.StandardMaterial[] {
    const mats: pc.StandardMaterial[] = [];
    for (const data of this.nodeMap.values()) {
      mats.push(data.material);
    }
    return mats;
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
  }
}
