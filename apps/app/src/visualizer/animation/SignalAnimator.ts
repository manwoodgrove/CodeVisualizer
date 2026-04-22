import * as pc from 'playcanvas';
import type { SignalSimulation, SignalFrame } from '@cv/types';
import type { NodeFactory } from '../scene/NodeFactory.js';
import type { EdgeFactory } from '../scene/EdgeFactory.js';
import type { CameraAnimator } from './CameraAnimator.js';
import { FlowParticle } from './FlowParticle.js';

export class SignalAnimator {
  private app: pc.Application;
  private nodeFactory: NodeFactory;
  private edgeFactory: EdgeFactory;
  private cameraAnim: CameraAnimator;
  private particleRoot: pc.Entity;

  private sim: SignalSimulation | null = null;
  private speed = 1.0;
  private clock = 0; // virtual ms
  private playing = false;
  private lastFrameIdx = -1;
  private onFrameCb: ((idx: number) => void) | undefined;

  private particles: FlowParticle[] = [];
  private destroyed = false;

  constructor(
    app: pc.Application,
    nodeFactory: NodeFactory,
    edgeFactory: EdgeFactory,
    cameraAnim: CameraAnimator,
    particleRoot: pc.Entity,
  ) {
    this.app = app;
    this.nodeFactory = nodeFactory;
    this.edgeFactory = edgeFactory;
    this.cameraAnim = cameraAnim;
    this.particleRoot = particleRoot;
  }

  play(sim: SignalSimulation, opts?: { speed?: number; onFrame?: (idx: number) => void }): void {
    this.sim = sim;
    this.clock = 0;
    this.lastFrameIdx = -1;
    this.speed = opts?.speed ?? this.speed;
    this.onFrameCb = opts?.onFrame;
    this.playing = true;
    this.clearParticles();
  }

  pause(): void {
    this.playing = false;
  }

  resume(): void {
    this.playing = true;
  }

  seek(idx: number): void {
    if (!this.sim) return;
    const frame = this.sim.frames[idx];
    if (!frame) return;
    this.clock = frame.timestamp;
    this.lastFrameIdx = idx - 1;
    this.clearParticles();
  }

  setSpeed(s: number): void {
    this.speed = s;
  }

  update(dt: number): void {
    if (this.destroyed) return;

    // Step particles
    this.particles = this.particles.filter(p => !p.update(dt));

    if (!this.playing || !this.sim) return;

    this.clock += dt * 1000 * this.speed;

    const frames = this.sim.frames;
    for (let i = this.lastFrameIdx + 1; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.timestamp > this.clock) break;

      this.applyFrame(frame);
      this.lastFrameIdx = i;
      this.onFrameCb?.(i);
    }

    // Stop at end
    if (this.lastFrameIdx >= frames.length - 1) {
      this.playing = false;
    }
  }

  private applyFrame(frame: SignalFrame): void {
    // Pulse active nodes
    for (const nodeId of frame.activeNodeIds) {
      this.nodeFactory.pulse(nodeId, 600);
    }

    // Spawn flow particles for active edges
    for (const edgeId of frame.activeEdgeIds) {
      const pts = this.edgeFactory.getCurvePoints(edgeId);
      if (pts && pts.length >= 2) {
        const particle = new FlowParticle(this.app, this.particleRoot, pts, 800);
        this.particles.push(particle);
      }
    }

    // Drift camera toward centroid of active nodes
    if (frame.activeNodeIds.length > 0) {
      this.cameraAnim.focusOnSet(frame.activeNodeIds, 1200);
    }
  }

  private clearParticles(): void {
    for (const p of this.particles) p.destroy();
    this.particles = [];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearParticles();
  }
}
