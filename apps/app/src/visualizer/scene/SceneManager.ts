import * as pc from 'playcanvas';
import type { GraphSnapshot, SignalSimulation } from '@cv/types';
import type { EdgeKind } from '@cv/types';

import { CameraRig }      from './CameraRig.js';
import { LightingRig }    from './LightingRig.js';
import { NodeFactory }    from './NodeFactory.js';
import { EdgeFactory }    from './EdgeFactory.js';
import { LodManager }     from './LodManager.js';
import { PickManager }    from './PickManager.js';
import { ClusterShell }   from './ClusterShell.js';
import { loadFont }       from './FontLoader.js';
import { SignalAnimator }  from '../animation/SignalAnimator.js';
import { CameraAnimator } from '../animation/CameraAnimator.js';
import { useGraphStore }  from '../../store/graphStore.js';

export class SceneManager {
  private app: pc.Application;
  private destroyed = false;

  // Scene hierarchy roots
  private root: pc.Entity;
  private graphRoot: pc.Entity;
  private edgeRoot: pc.Entity;
  private clusterRoot: pc.Entity;
  private particleRoot: pc.Entity;
  private lightingRoot: pc.Entity;

  // Sub-systems
  private cameraRig: CameraRig;
  private lightingRig: LightingRig;
  private nodeFactory: NodeFactory;
  private edgeFactory: EdgeFactory;
  private lodManager: LodManager | null = null;
  private clusterShell: ClusterShell;
  private pickManager: PickManager | null = null;
  private signalAnimator: SignalAnimator;
  private cameraAnimator: CameraAnimator;

  // Font (lazy-initialized on first setSnapshot)
  private fontAsset: pc.Asset | null = null;

  // State
  private nodeEntities  = new Map<string, pc.Entity>();
  private entityToId    = new Map<pc.Entity, string>();
  private currentHighlight: string | null = null;
  private pickHandlers: Array<(nodeId: string | null) => void> = [];

  // Subscriptions
  private unsubCluster: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: { antialias: true, alpha: false },
      keyboard: new pc.Keyboard(canvas),
      mouse:    new pc.Mouse(canvas),
    });

    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.start();

    this.root = new pc.Entity('Root');
    this.app.root.addChild(this.root);

    this.lightingRoot = new pc.Entity('Lighting');
    this.root.addChild(this.lightingRoot);

    this.clusterRoot = new pc.Entity('Clusters');
    this.graphRoot   = new pc.Entity('GraphRoot');
    this.edgeRoot    = new pc.Entity('Edges');
    this.root.addChild(this.clusterRoot);
    this.root.addChild(this.graphRoot);
    this.root.addChild(this.edgeRoot);

    this.particleRoot = new pc.Entity('ParticleRoot');
    this.root.addChild(this.particleRoot);

    this.cameraRig    = new CameraRig(this.app, this.root);
    this.lightingRig  = new LightingRig(this.app, this.lightingRoot);
    this.nodeFactory  = new NodeFactory(this.app);
    this.edgeFactory  = new EdgeFactory(this.app);
    this.clusterShell = new ClusterShell();

    this.cameraAnimator = new CameraAnimator(
      this.cameraRig,
      (id) => this.nodeFactory.getPosition(id),
    );

    this.signalAnimator = new SignalAnimator(
      this.app,
      this.nodeFactory,
      this.edgeFactory,
      this.cameraAnimator,
      this.particleRoot,
    );

    this.app.on('update', (dt: number) => {
      if (this.destroyed) return;
      this.cameraRig.update(dt);
      this.nodeFactory.update(dt);
      this.nodeFactory.updateLabels(this.cameraRig.entity);
      this.edgeFactory.update(dt);
      this.signalAnimator.update(dt);
      // ClusterShell spring physics
      this.clusterShell.update(dt);
      // LOD: runs after nodeFactory.updateLabels so 80u threshold wins over 800u
      this.lodManager?.update();
    });

    window.addEventListener('resize', () => {
      if (this.destroyed) return;
      this.app.resizeCanvas();
      this.pickManager?.resize();
    });
  }

  setSnapshot(snapshot: GraphSnapshot): void {
    if (this.destroyed) return;

    if (!this.fontAsset) {
      loadFont(this.app).then((asset) => {
        this.fontAsset = asset;
        this.buildSnapshot(snapshot);
      });
    } else {
      this.buildSnapshot(snapshot);
    }
  }

  private buildSnapshot(snapshot: GraphSnapshot): void {
    if (this.destroyed) return;

    // Tear down
    this.nodeFactory.clear();
    this.edgeFactory.clear();
    this.clusterShell.clear();
    this.lodManager?.clear();
    this.pickManager?.destroy();
    this.pickManager = null;
    this.nodeEntities.clear();
    this.entityToId.clear();
    this.currentHighlight = null;

    // Unsubscribe previous cluster subscription
    this.unsubCluster?.();
    this.unsubCluster = null;

    this.graphRoot.destroy();
    this.edgeRoot.destroy();
    this.clusterRoot.destroy();

    this.clusterRoot = new pc.Entity('Clusters');
    this.graphRoot   = new pc.Entity('GraphRoot');
    this.edgeRoot    = new pc.Entity('Edges');
    this.root.addChild(this.clusterRoot);
    this.root.addChild(this.graphRoot);
    this.root.addChild(this.edgeRoot);

    // Populate nodes
    this.nodeEntities = this.nodeFactory.createNodes(
      snapshot,
      this.graphRoot,
      this.fontAsset ?? undefined,
    );

    for (const [id, entity] of this.nodeEntities) {
      this.entityToId.set(entity, id);
      for (const child of entity.children) {
        this.entityToId.set(child as pc.Entity, id);
      }
    }

    // Populate edges
    this.edgeFactory.createEdges(snapshot, this.nodeEntities, this.edgeRoot);

    // Cluster spring shells
    this.clusterShell.createShells(
      this.app,
      snapshot,
      this.nodeEntities,
      this.clusterRoot,
    );

    // LOD manager — register all nodes and edge pairs
    this.lodManager = new LodManager(this.app, this.cameraRig);

    for (const [id, entity] of this.nodeEntities) {
      const label = entity.findByName('label') as pc.Entity | null;
      if (label) this.lodManager.registerNode(id, entity, label);
    }

    for (const edge of snapshot.edges) {
      const tubeEntity = this.edgeFactory.getEdgeEntity(edge.id);
      const lineEntity = this.edgeFactory.getLineEntity(edge.id);
      const midpoint   = this.edgeFactory.getMidpoint(edge.id);
      if (tubeEntity && lineEntity && midpoint) {
        this.lodManager.registerEdge(edge.id, tubeEntity, lineEntity, midpoint);
      }
    }

    // Subscribe to cluster expand/collapse store changes
    this.unsubCluster = useGraphStore.subscribe(
      (state) => state.expandedClusters,
      (expandedClusters) => {
        if (!this.destroyed) this.clusterShell.syncExpanded(expandedClusters);
      },
    );

    // Picker
    this.pickManager = new PickManager(
      this.app,
      this.cameraRig.cameraComponent,
      this.nodeEntities,
      this.entityToId,
    );
    for (const h of this.pickHandlers) {
      this.pickManager.onPick(h);
    }
  }

  highlightNode(nodeId: string | null): void {
    if (this.destroyed) return;
    if (this.currentHighlight) {
      this.nodeFactory.setHighlight(this.currentHighlight, false);
    }
    this.currentHighlight = nodeId;
    if (nodeId) {
      this.nodeFactory.setHighlight(nodeId, true);
    }
  }

  focusOnNode(nodeId: string): void {
    if (this.destroyed) return;
    this.cameraAnimator.focusOnNode(nodeId, 600);
  }

  playSimulation(
    sim: SignalSimulation,
    opts?: { speed?: number; onFrame?: (idx: number) => void },
  ): void {
    if (this.destroyed) return;
    this.signalAnimator.play(sim, opts);
  }

  pauseSimulation(): void {
    if (this.destroyed) return;
    this.signalAnimator.pause();
  }

  resumeSimulation(): void {
    if (this.destroyed) return;
    this.signalAnimator.resume();
  }

  seekSimulation(frameIdx: number): void {
    if (this.destroyed) return;
    this.signalAnimator.seek(frameIdx);
  }

  setSpeed(speed: number): void {
    if (this.destroyed) return;
    this.signalAnimator.setSpeed(speed);
  }

  setVisibleEdgeKinds(kinds: Set<string>): void {
    if (this.destroyed) return;
    this.edgeFactory.setVisibleKinds(kinds as Set<EdgeKind>);
  }

  onPick(handler: (nodeId: string | null) => void): void {
    if (this.destroyed) return;
    this.pickHandlers.push(handler);
    this.pickManager?.onPick(handler);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.unsubCluster?.();
    this.signalAnimator.destroy();
    this.pickManager?.destroy();
    this.cameraRig.destroy();
    this.lightingRig.destroy();
    this.nodeFactory.clear();
    this.edgeFactory.clear();
    this.clusterShell.clear();
    this.lodManager?.clear();

    this.app.destroy();
  }
}
