import * as pc from 'playcanvas';
import type { SignalFrame, GraphEdge } from '@codevisualizer/types';
import type { NodeFactory } from '../scene/NodeFactory.js';
import type { EdgeFactory } from '../scene/EdgeFactory.js';
import { getEdgeMaterial } from '../materials/edge-material.js';
import { getParticleMaterial } from '../materials/edge-material.js';
import { useGraphStore } from '../../store/graph-store.js';

export class SignalAnimator {
  private app: pc.Application;
  private nodeFactory: NodeFactory;
  private edgeFactory: EdgeFactory;
  private particleRoot: pc.Entity;
  private activeNodeIds = new Set<string>();
  private activeEdgeIds = new Set<string>();
  private particles: pc.Entity[] = [];

  constructor(
    app: pc.Application,
    nodeFactory: NodeFactory,
    edgeFactory: EdgeFactory,
    particleRoot: pc.Entity,
  ) {
    this.app = app;
    this.nodeFactory = nodeFactory;
    this.edgeFactory = edgeFactory;
    this.particleRoot = particleRoot;
  }

  applyFrame(frame: SignalFrame | null) {
    this.clearActive();
    if (!frame) return;

    const snapshot = useGraphStore.getState().snapshot;
    const edgeById = new Map(snapshot?.edges.map(e => [e.id, e]) ?? []);

    for (const nodeId of frame.activeNodeIds) {
      this.activeNodeIds.add(nodeId);
      this.nodeFactory.pulse(nodeId);
    }

    for (const edgeId of frame.activeEdgeIds) {
      this.activeEdgeIds.add(edgeId);
      const edge = edgeById.get(edgeId);
      if (edge) {
        this.edgeFactory.setActive(edgeId, true, edge.kind);
        this.spawnFlowParticle(edgeId);
      }
    }

    // Show state delta labels as floating text
    for (const delta of frame.stateDeltas) {
      this.showStateDelta(delta.nodeId, delta.valueAfter);
    }
  }

  private clearActive() {
    const snapshot = useGraphStore.getState().snapshot;
    const edgeById = new Map(snapshot?.edges.map(e => [e.id, e]) ?? []);

    for (const edgeId of this.activeEdgeIds) {
      const edge = edgeById.get(edgeId);
      if (edge) this.edgeFactory.setActive(edgeId, false, edge.kind);
    }
    for (const p of this.particles) p.destroy();
    this.particles = [];
    this.activeNodeIds.clear();
    this.activeEdgeIds.clear();
  }

  private spawnFlowParticle(edgeId: string) {
    const curve = this.edgeFactory.getCurve(edgeId);
    if (!curve || curve.length === 0) return;

    const particle = new pc.Entity('particle');
    particle.addComponent('model', { type: 'asset' });
    const mesh = pc.createSphere(this.app.graphicsDevice, { radius: 1.2 });
    particle.model!.meshInstances = [new pc.MeshInstance(mesh, getParticleMaterial())];
    particle.setPosition(curve[0].x, curve[0].y, curve[0].z);
    this.particleRoot.addChild(particle);
    this.particles.push(particle);

    const duration = 400;
    const start = performance.now();

    const animate = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      const idx = Math.floor(t * (curve.length - 1));
      const local = (t * (curve.length - 1)) - idx;
      const a = curve[Math.min(idx, curve.length - 1)];
      const b = curve[Math.min(idx + 1, curve.length - 1)];
      particle.setPosition(
        a.x + (b.x - a.x) * local,
        a.y + (b.y - a.y) * local,
        a.z + (b.z - a.z) * local,
      );
      if (t < 1) requestAnimationFrame(animate);
      else particle.enabled = false;
    };
    requestAnimationFrame(animate);
  }

  private showStateDelta(nodeId: string, label: string) {
    const entity = this.nodeFactory.getEntity(nodeId);
    if (!entity) return;

    const pos = entity.getPosition();
    const floater = new pc.Entity('delta-label');
    floater.addComponent('element', {
      type: pc.ELEMENTTYPE_TEXT,
      text: label,
      fontSize: 9,
      color: new pc.Color(1, 0.9, 0.2),
      anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
      pivot: new pc.Vec2(0.5, 0),
      width: 120,
      height: 16,
    });
    floater.setPosition(pos.x, pos.y + 12, pos.z);
    this.particleRoot.addChild(floater);
    this.particles.push(floater);

    // Float up and fade out over 1.5s
    const start = performance.now();
    const origY = pos.y + 12;
    const animate = () => {
      const t = Math.min((performance.now() - start) / 1500, 1);
      floater.setPosition(pos.x, origY + t * 10, pos.z);
      if (floater.element) floater.element.opacity = 1 - t;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  reset() {
    this.clearActive();
  }
}
