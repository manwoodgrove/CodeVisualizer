import * as pc from 'playcanvas';
import type { GraphSnapshot } from '@codevisualizer/types';
import { NodeFactory } from './NodeFactory.js';
import { EdgeFactory } from './EdgeFactory.js';
import { useGraphStore } from '../../store/graph-store.js';
import { useSignalStore } from '../../store/signal-store.js';
import { SignalAnimator } from '../animation/SignalAnimator.js';
import { flyToPosition } from '../engine/camera.js';
import type { OrbitCameraState } from '../engine/camera.js';

export class SceneManager {
  private app: pc.Application;
  private graphRoot: pc.Entity;
  private particleRoot: pc.Entity;
  private nodeFactory: NodeFactory;
  private edgeFactory: EdgeFactory;
  private signalAnimator: SignalAnimator;
  private cameraState: OrbitCameraState;
  private unsubs: Array<() => void> = [];

  constructor(app: pc.Application, cameraState: OrbitCameraState) {
    this.app = app;
    this.cameraState = cameraState;

    this.graphRoot = new pc.Entity('GraphRoot');
    this.particleRoot = new pc.Entity('ParticleRoot');
    app.root.addChild(this.graphRoot);
    app.root.addChild(this.particleRoot);

    this.nodeFactory = new NodeFactory(app, this.graphRoot);
    this.edgeFactory = new EdgeFactory(app, this.graphRoot);
    this.signalAnimator = new SignalAnimator(app, this.nodeFactory, this.edgeFactory, this.particleRoot);

    this.subscribeToStores();
  }

  private subscribeToStores() {
    // Subscribe to graph snapshot changes
    this.unsubs.push(
      useGraphStore.subscribe((state) => {
        const snapshot = state.snapshot;
        if (snapshot) this.loadGraph(snapshot);
      }),
    );

    // Subscribe to signal changes
    this.unsubs.push(
      useSignalStore.subscribe((state) => {
        const { simulation, frameIdx, playbackState, speed } = state;
        if (!simulation) { this.signalAnimator.reset(); return; }
        this.signalAnimator.applyFrame(simulation.frames[frameIdx] ?? null);
        if (playbackState === 'playing') {
          setTimeout(() => {
            useSignalStore.getState().nextFrame();
          }, 300 / speed);
        }
      }),
    );

    // Subscribe to selected node for camera fly-to
    this.unsubs.push(
      useGraphStore.subscribe((state) => {
        const { selectedNodeId, snapshot } = state;
        if (!selectedNodeId || !snapshot) return;
        const node = snapshot.nodes.find(n => n.id === selectedNodeId);
        if (!node) return;
        flyToPosition(
          this.cameraState,
          new pc.Vec3(node.position3d.x, node.position3d.y, node.position3d.z),
          100,
        );
      }),
    );
  }

  private loadGraph(snapshot: GraphSnapshot) {
    this.clearScene();

    const nodeById = new Map(snapshot.nodes.map(n => [n.id, n]));

    for (const node of snapshot.nodes) {
      this.nodeFactory.createNode(node);
    }

    for (const edge of snapshot.edges) {
      const src = nodeById.get(edge.source);
      const tgt = nodeById.get(edge.target);
      if (src && tgt) this.edgeFactory.createEdge(edge, src, tgt);
    }

    this.setupPicking(snapshot);
  }

  private setupPicking(snapshot: GraphSnapshot) {
    const camera = this.cameraState.entity;
    const cameraComponent = camera.camera;
    if (!cameraComponent) return;

    this.app.graphicsDevice.canvas.addEventListener('click', (e) => {
      const canvas = e.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Simple ray-cast: find closest node by 2D screen proximity
      // PlayCanvas Picker API changed in v2 — use a simpler approach
      const bestNode = this.pickNodeByScreenPos(x, y, canvas.width, canvas.height, snapshot);
      useGraphStore.getState().selectNode(bestNode ?? null);
    });
  }

  private pickNodeByScreenPos(
    screenX: number, screenY: number,
    canvasW: number, canvasH: number,
    snapshot: GraphSnapshot,
  ): string | null {
    const camera = this.cameraState.entity;
    let best: string | null = null;
    let bestDist = 30; // max screen px radius for a hit

    for (const node of snapshot.nodes) {
      const worldPos = new pc.Vec3(node.position3d.x, node.position3d.y, node.position3d.z);
      const screenPos = new pc.Vec4();

      // Project to clip space
      const viewProj = new pc.Mat4();
      viewProj.mul2(camera.camera!.projectionMatrix, camera.camera!.viewMatrix);
      const clip = viewProj.transformPoint(worldPos, new pc.Vec3());

      // Convert NDC to screen
      const sx = ((clip.x + 1) * 0.5) * canvasW;
      const sy = ((1 - clip.y) * 0.5) * canvasH;

      const dist = Math.hypot(sx - screenX, sy - screenY);
      if (dist < bestDist) {
        bestDist = dist;
        best = node.id;
      }
    }
    return best;
  }

  private clearScene() {
    this.signalAnimator.reset();
    this.nodeFactory.destroy();
    this.edgeFactory.destroy();
  }

  destroy() {
    this.clearScene();
    for (const unsub of this.unsubs) unsub();
    this.graphRoot.destroy();
    this.particleRoot.destroy();
  }
}
