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

// Vibrant neon palette inspired by the reference art — each kind reads as a
// distinct glowing "chip" on the grid plane.
const NODE_COLORS: Record<NodeKind, string> = {
  MODULE:   '#22D3FF', // electric cyan
  CLASS:    '#F472FF', // hot magenta
  FUNCTION: '#39FF7A', // neon green
  METHOD:   '#5AF0E6', // teal
  VARIABLE: '#FFB648', // amber-orange
};

// Per-kind animation profile. Each axis controls a different gentle motion
// applied each frame so the graph feels alive rather than frozen.
//   bobAmp:    vertical hover amplitude (world units)
//   bobFreq:   vertical hover frequency (rad/s)
//   spinSpeed: yaw rotation speed (deg/s, 0 = no spin)
const KIND_MOTION: Record<NodeKind, { bobAmp: number; bobFreq: number; spinSpeed: number }> = {
  MODULE:   { bobAmp: 0.0,  bobFreq: 0.0, spinSpeed:  0.0  }, // grounded buildings
  CLASS:    { bobAmp: 0.0,  bobFreq: 0.0, spinSpeed:  0.0  }, // grounded buildings
  FUNCTION: { bobAmp: 1.6,  bobFreq: 1.4, spinSpeed: 18.0  }, // floating spheres bob + spin
  METHOD:   { bobAmp: 1.2,  bobFreq: 1.7, spinSpeed: 22.0  }, // capsules tumble
  VARIABLE: { bobAmp: 0.9,  bobFreq: 2.0, spinSpeed: 35.0  }, // cones whirl
};

function computeScale(node: GraphNode): number {
  const scaleFactor = 4.0;
  const m = node.metrics;
  switch (node.kind) {
    case 'MODULE':
      return (1.0 + m.linesOfCode / 200) * scaleFactor;
    case 'CLASS':
      return (1.0 + m.linesOfCode / 150) * scaleFactor;
    case 'FUNCTION':
      return Math.max(0.4, Math.min(4, 0.6 + m.cyclomaticComplexity * 0.15)) * scaleFactor;
    case 'METHOD':
      return (0.5 + m.linesOfCode / 80) * scaleFactor;
    case 'VARIABLE':
      return 0.4 * scaleFactor;
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
  basePosition: pc.Vec3;
  material: pc.StandardMaterial;
  colorHex: string;
  // Animation phase (deterministic per node so motion is reproducible).
  bobPhase: number;
  spinPhase: number;
  motion: { bobAmp: number; bobFreq: number; spinSpeed: number };
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
  private elapsed = 0;

  constructor(app: pc.Application) {
    this.app = app;
  }

  createNodes(
    snapshot: GraphSnapshot,
    parent: pc.Entity,
    fontAsset?: pc.Asset,
  ): Map<string, pc.Entity> {
    const entityMap = new Map<string, pc.Entity>();

    let phaseSeed = 0;

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

      const basePos = new pc.Vec3(node.position3d.x, node.position3d.y, node.position3d.z);
      entity.setLocalPosition(basePos.x, basePos.y, basePos.z);
      entity.setLocalScale(entityScale.x, entityScale.y, entityScale.z);

      parent.addChild(entity);

      this.addLabel(entity, node.name, baseScale, fontAsset);

      // Deterministic per-node phases derived from a counter so the same
      // graph always animates the same way (helps reproducibility / tests).
      const bobPhase = (phaseSeed * 1.317) % (Math.PI * 2);
      const spinPhase = (phaseSeed * 2.713) % 360;
      phaseSeed++;

      const data: NodeData = {
        entity,
        baseScale: entityScale.clone(),
        basePosition: basePos,
        material: mat,
        colorHex,
        bobPhase,
        spinPhase,
        motion: KIND_MOTION[node.kind],
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
      enabled: false,
      fontAsset: fontAsset.id,
      fontSize: 3,
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
      data.material.setParameter('u_baseEmissive', [color.r * 1.4, color.g * 1.4, color.b * 1.4]);
      data.entity.setLocalScale(
        data.baseScale.x * 1.4,
        data.baseScale.y * 1.4,
        data.baseScale.z * 1.4,
      );
    } else {
      data.material.setParameter('u_baseEmissive', [color.r * 0.85, color.g * 0.85, color.b * 0.85]);
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
    this.elapsed += dt;

    for (const data of this.nodeMap.values()) {
      const m = data.motion;

      // Idle hover — vertical bob in world space, applied on top of base
      // position so layout stays authoritative.
      let bobY = 0;
      if (m.bobAmp > 0) {
        bobY = Math.sin(this.elapsed * m.bobFreq + data.bobPhase) * m.bobAmp;
        data.entity.setLocalPosition(
          data.basePosition.x,
          data.basePosition.y + bobY,
          data.basePosition.z,
        );
      }

      // Idle spin — yaw rotation only, so silhouettes stay readable.
      if (m.spinSpeed !== 0) {
        const yaw = data.spinPhase + this.elapsed * m.spinSpeed;
        data.entity.setLocalEulerAngles(0, yaw, 0);
      }

      // Pulse scale tween (signal playback).
      if (data.pulseActive) {
        data.pulseElapsed += dt * 1000;
        const t = Math.min(data.pulseElapsed / data.pulseDur, 1);
        const wave = t < 0.5 ? t * 2 : (1 - t) * 2;
        const scaleBoost = 1 + wave * 0.45;

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
  }

  updateLabels(camera: pc.Entity): void {
    const camPos = camera.getPosition();

    for (const data of this.nodeMap.values()) {
      const labelEntity = data.entity.findByName('label');
      if (!labelEntity) continue;

      const visible = false;

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
