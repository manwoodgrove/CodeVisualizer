import * as pc from 'playcanvas';
import type { GraphSnapshot, SignalSimulation, NodeKind } from '@cv/types';
import type { EdgeKind } from '@cv/types';

import { CameraRig }      from './CameraRig.js';
import { LightingRig }    from './LightingRig.js';
import { NodeFactory }    from './NodeFactory.js';
import { EdgeFactory }    from './EdgeFactory.js';
import { PickManager }    from './PickManager.js';
import { ClusterShell }   from './ClusterShell.js';
import { LodManager }     from './LodManager.js';
import { GroundPlane }    from './GroundPlane.js';
import { loadFont }       from './FontLoader.js';
import { tickTime as pulseTick } from './PulseMaterial.js';
import { SignalAnimator }  from '../animation/SignalAnimator.js';
import { CameraAnimator } from '../animation/CameraAnimator.js';
import { useGraphStore }  from '../../store/graphStore.js';

// Per-kind elevation above the ground plane. Kept small so nodes still read as
// "resting on the plane" while giving modules/classes a slight lift over
// functions and variables for readability.
const KIND_Y: Record<NodeKind, number> = {
  MODULE:   0.0,
  CLASS:    0.0,
  FUNCTION: 30.0,
  METHOD:   30.0,
  VARIABLE: 15.0,
};

const PLANE_SCALE = 0.9;

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
  private clusterShell: ClusterShell;
  private lodManager: LodManager | null = null;
  private pickManager: PickManager | null = null;
  private signalAnimator: SignalAnimator;
  private cameraAnimator: CameraAnimator;
  private groundPlane: GroundPlane;

  // Font (lazy-initialized on first setSnapshot)
  private fontAsset: pc.Asset | null = null;

  // Shader time accumulator for pulse materials
  private shaderTime = 0;

  // Zustand unsubscribe handle for cluster state

  // State
  private nodeEntities  = new Map<string, pc.Entity>();
  private entityToId    = new Map<pc.Entity, string>();
  private currentHighlight: string | null = null;
  private pickHandlers: Array<(nodeId: string | null) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    // Create PlayCanvas application
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: { antialias: true, alpha: false },
      keyboard: new pc.Keyboard(canvas),
      mouse:    new pc.Mouse(canvas),
    });

    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.start();

    // Scene root
    this.root = new pc.Entity('Root');
    this.app.root.addChild(this.root);

    // Lighting container
    this.lightingRoot = new pc.Entity('Lighting');
    this.root.addChild(this.lightingRoot);

    // Graph hierarchy
    this.clusterRoot = new pc.Entity('Clusters');
    this.graphRoot   = new pc.Entity('GraphRoot');
    this.edgeRoot    = new pc.Entity('Edges');
    this.root.addChild(this.clusterRoot);
    this.root.addChild(this.graphRoot);
    this.root.addChild(this.edgeRoot);

    // Particle root
    this.particleRoot = new pc.Entity('ParticleRoot');
    this.root.addChild(this.particleRoot);

    // Sub-systems
    this.cameraRig    = new CameraRig(this.app, this.root);
    this.lightingRig  = new LightingRig(this.app, this.lightingRoot);
    this.nodeFactory  = new NodeFactory(this.app);
    this.edgeFactory  = new EdgeFactory(this.app);
    this.clusterShell = new ClusterShell();
    this.groundPlane  = new GroundPlane(this.app, this.root);

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

    // Main update loop
    this.app.on('update', (dt: number) => {
      if (this.destroyed) return;
      this.cameraRig.update(dt);
      this.groundPlane.update(dt);                               // 0. grid shimmer
      this.nodeFactory.update(dt);                               // 1. pulse scale tweens
      this.edgeFactory.update(dt);                               // 2. edge flow UV scroll
      this.clusterShell.syncExpanded(useGraphStore.getState().expandedClusters);
      this.clusterShell.update(dt);                             // 3. spring physics
      this.signalAnimator.update(dt);                           // 4. signal playback
      this.shaderTime += dt;                                     // 5. pulse shader time
      pulseTick(this.nodeFactory.getMaterials(), this.shaderTime);
      this.lodManager?.update();                                 // 6. LOD (after positions settle)
      this.nodeFactory.updateLabels(this.cameraRig.entity);     // 7. label billboard / cull
    });

    // Handle resize
    window.addEventListener('resize', () => {
      if (this.destroyed) return;
      this.app.resizeCanvas();
      this.pickManager?.resize();
    });
  }

  setSnapshot(snapshot: GraphSnapshot): void {
    if (this.destroyed) return;

    // Remap the layout so the graph rests on the XZ plane (y = small per-kind
    // elevation) rather than being stacked by cluster along Z. The backend
    // still produces a 2D ForceAtlas2 layout in (x, y) with a per-cluster Z —
    // we ignore that Z here and use it only to add a tiny jitter so stacked
    // nodes don't Z-fight with each other on the plane.
    const flat = flattenToPlane(snapshot);

    // Lazy-init font then build scene; fire-and-forget is safe here because
    // buildSnapshot is self-contained and the app loop is already running.
    if (!this.fontAsset) {
      loadFont(this.app).then((asset) => {
        this.fontAsset = asset;
        this.buildSnapshot(flat);
      });
    } else {
      this.buildSnapshot(flat);
    }
  }

  private buildSnapshot(snapshot: GraphSnapshot): void {
    if (this.destroyed) return;

    // Tear down previous scene objects
    this.nodeFactory.clear();
    this.edgeFactory.clear();
    this.clusterShell.clear();
    this.lodManager?.clear();
    this.pickManager?.destroy();
    this.pickManager = null;
    this.nodeEntities.clear();
    this.entityToId.clear();
    this.currentHighlight = null;

    // Remove and re-add hierarchy roots to clear children cleanly
    this.graphRoot.destroy();
    this.edgeRoot.destroy();
    this.clusterRoot.destroy();

    this.clusterRoot = new pc.Entity('Clusters');
    this.graphRoot   = new pc.Entity('GraphRoot');
    this.edgeRoot    = new pc.Entity('Edges');
    this.root.addChild(this.clusterRoot);
    this.root.addChild(this.graphRoot);
    this.root.addChild(this.edgeRoot);

    // Create new content
    this.nodeEntities = this.nodeFactory.createNodes(
      snapshot,
      this.graphRoot,
      this.fontAsset ?? undefined,
    );

    // Build entityToId reverse map (walk over node factory's internal map)
    for (const [id, entity] of this.nodeEntities) {
      this.entityToId.set(entity, id);
      // Also map children so picker can walk up
      for (const child of entity.children) {
        this.entityToId.set(child as pc.Entity, id);
      }
    }

    this.edgeFactory.createEdges(snapshot, this.nodeEntities, this.edgeRoot);

    // Spring-based cluster animation (replaces wireframe shells)
    this.clusterShell.register(snapshot, this.nodeEntities);

    // Initialise cluster store: all clusters start expanded
    const clusterIds = snapshot.clusters.map((c) => c.id);
    useGraphStore.getState().initClusters(clusterIds);

    // LOD manager
    this.lodManager = new LodManager(this.cameraRig.entity);

    for (const [id, entity] of this.nodeEntities) {
      const labelEntity = entity.findByName('label') as pc.Entity | null;
      this.lodManager.registerNode(id, entity, labelEntity);
    }

    for (const rec of this.edgeFactory.getLodRecords()) {
      this.lodManager.registerEdge(
        rec.edgeId,
        rec.entity,
        rec.tubeMesh,
        rec.lineMesh,
        rec.meshInstance,
        rec.midpoint,
      );
    }

    // Cluster expand/collapse is driven by the per-frame syncExpanded call
    // in the update tick — no subscribe needed.

    // Init picker — re-register any previously registered handlers
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

    this.signalAnimator.destroy();
    this.pickManager?.destroy();
    this.cameraRig.destroy();
    this.lightingRig.destroy();
    this.nodeFactory.clear();
    this.edgeFactory.clear();
    this.clusterShell.clear();
    this.lodManager?.clear();

    this.groundPlane.destroy();
    this.app.destroy();
  }
}

// Remap backend layout (2D x,y + clustered z stack) onto the ground plane.
// - Old: scene.x = n.x,        scene.y = n.y,       scene.z = clusterIdx*30
// - New: scene.x = n.x*SCALE,  scene.y = kindLift,  scene.z = n.y*SCALE
// Cluster centroids are recomputed in the new coordinate space so that
// collapse/expand springs target the correct on-plane positions.
function flattenToPlane(snapshot: GraphSnapshot): GraphSnapshot {
  const nodes = snapshot.nodes.map((n) => {
    const lift = KIND_Y[n.kind];
    // Small deterministic y-jitter so identical-kind nodes at the same spot
    // don't Z-fight. Derived from the stale cluster-stack z so two different
    // clusters still get slightly different lifts.
    const jitter = ((n.position3d.z % 6) - 3) * 0.05;
    return {
      ...n,
      position3d: {
        x: n.position3d.x,
        y: lift + jitter,
        z: n.position3d.y,
      },
    };
  });

  const agg = new Map<string, { x: number; y: number; z: number; count: number }>();
  for (const n of nodes) {
    if (!n.clusterId) continue;
    const entry = agg.get(n.clusterId) ?? { x: 0, y: 0, z: 0, count: 0 };
    entry.x += n.position3d.x;
    entry.y += n.position3d.y;
    entry.z += n.position3d.z;
    entry.count += 1;
    agg.set(n.clusterId, entry);
  }

  const clusters = snapshot.clusters.map((c) => {
    const entry = agg.get(c.id);
    if (!entry || entry.count === 0) return c;
    return {
      ...c,
      centroid3d: {
        x: entry.x / entry.count,
        y: entry.y / entry.count,
        z: entry.z / entry.count,
      },
    };
  });

  return { ...snapshot, nodes, clusters };
}
