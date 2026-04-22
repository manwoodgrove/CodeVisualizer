# Context

Build a PlayCanvas-based 3D code visualization tool for understanding how a codebase works. Users import a GitHub repository via OAuth login, the backend parses all JS/TS source files into a component graph (functions, classes, modules as nodes; imports, calls, inheritance as edges), and PlayCanvas renders that graph as interactive 3D objects with animated signal propagation. The pedagogic goal is to let developers "see" a call chain travel through a codebase by executing a signal on any node and watching it animate across the graph.

---

# Scope & User Choices

- **Languages**: JavaScript / TypeScript only (Babel/typescript-estree AST)
- **Signals**: Static analysis — BFS over call-edge graph (no code execution)
- **GitHub auth**: Full OAuth login (GitHub OAuth App → access token stored in session)

---

# Architecture Overview

Monorepo (pnpm workspaces):
- `packages/types` — shared TypeScript data model
- `apps/api` — Fastify backend (parse, layout, simulate, GitHub OAuth)
- `apps/app` — Vite + React + PlayCanvas frontend

---

# Data Model (`packages/types/src/graph.ts`)

```ts
type NodeKind = 'MODULE' | 'CLASS' | 'FUNCTION' | 'METHOD' | 'VARIABLE'
type EdgeKind = 'IMPORT' | 'CALL' | 'INHERITANCE' | 'DATA_FLOW' | 'EXPORT'

interface GraphNode { id, kind, name, filePath, exported, lineStart, lineEnd,
  clusterId, metrics: { linesOfCode, cyclomaticComplexity, inDegree, outDegree },
  position3d: { x, y, z } }

interface GraphEdge { id, source, target, kind, weight, resolved }

interface GraphCluster { id, label, color, nodeIds, centroid3d }

interface GraphSnapshot { repoId, repoName, nodes, edges, clusters, stats }

interface SignalFrame { frameIndex, timestamp, activeNodeIds, activeEdgeIds, stateDeltas }
interface SignalSimulation { simulationId, seedNodeId, frames, totalDuration }
```

---

# Backend (`apps/api`)

## GitHub OAuth Flow
1. `GET /auth/github` → redirect to GitHub OAuth with `repo` scope
2. `GET /auth/github/callback` → exchange code for token, store in encrypted session cookie
3. All `/api/repos/*` routes require auth middleware (reads token from session)

## Import Pipeline
```
POST /api/repos/import { url, branch? }
  → enqueue BullMQ ImportJob → return { jobId }

ImportWorker:
  1. github/fetcher.ts — Octokit tree API, batch-fetch file contents (concurrency=10)
     filter: .ts .tsx .js .jsx only, <500KB, skip node_modules/ dist/ build/
  2. parser/js-ts-parser.ts — @typescript-eslint/typescript-estree per file
     extract: ClassDeclaration, FunctionDeclaration, ArrowFunctionExpression,
              ImportDeclaration → IMPORT edges, CallExpression → CALL edges,
              extends clauses → INHERITANCE edges
  3. graph/builder.ts — merge per-file RawNode[]/RawEdge[] → unified graph
  4. graph/enricher.ts — resolve cross-file call references by name heuristic
  5. graph/clusterer.ts — Louvain communities (graphology-communities-louvain)
  6. graph/layout.ts — ForceAtlas2 2D (graphology-layout-forceatlas2, 300 iter)
     Z = clusterIndex * 30 + jitter  →  3D positions stored on nodes
  7. db/repos.ts — save GraphSnapshot JSON blob to SQLite (Drizzle ORM)
  8. socket.io emit job:done
```

## API Endpoints
```
POST   /api/repos/import              { url, branch? } → { jobId, repoId }
GET    /api/repos/:id                 → RepoMeta
GET    /api/repos/:id/graph           ?module=&depth= → GraphSnapshot (BFS-filtered)
POST   /api/repos/:id/signals/simulate { seedNodeId, maxHops? } → SignalSimulation
GET    /api/health

WS /jobs:
  job:progress  { jobId, phase: 'fetch'|'parse'|'layout', pct }
  job:done      { jobId, repoId }
  job:error     { jobId, message }
```

## Signal Simulator (`services/simulator/tracer.ts`)
BFS from `seedNodeId` over CALL edges (bidirectional option). Emits one `SignalFrame` per BFS depth level with 200ms inter-frame gap (configurable). Each frame contains: the newly reached nodeIds, the traversed edgeIds, and state-delta labels derived from variable assignments on the callee.

## Database (SQLite + Drizzle)
```
repos: id, url, name, branch, status, createdAt, updatedAt
graph_snapshots: repoId, nodeCount, edgeCount, data(JSON), layoutData(JSON), createdAt
sessions: id, userId, githubToken(encrypted), expiresAt
```

---

# Frontend (`apps/app`)

## PlayCanvas Scene Hierarchy
```
Root
├── CameraRig        OrbitCamera script, zoom/pan, fly-to animation
├── Lighting         Directional (key + fill) + ambient
├── GraphRoot        SceneManager orchestrates
│   ├── Clusters[]   ClusterEntity — transparent icosphere shell per community
│   │   └── Nodes[] NodeFactory entity per GraphNode
│   │       └── Label  SDF billboard text
│   └── Edges[]      EdgeFactory — Bézier tube meshes
└── ParticleRoot     SignalAnimator manages FlowParticle entities
```

## Visual Language (pedagogic design)
| Kind | Shape | Color | Size driver |
|---|---|---|---|
| MODULE | Hexagonal prism | Deep blue #1E3A8A | LOC/200 |
| CLASS | Rounded cube | Amber #D97706 | LOC/150 |
| FUNCTION | Sphere | Emerald #059669 | cyclomatic complexity |
| METHOD | Capsule | Teal #0891B2 | LOC/80 |
| VARIABLE | Tetrahedron | Slate #64748B | fixed small |
| CLUSTER | Wireframe icosphere | Palette color, 15% opacity | member count |

| Edge Kind | Visual | Color | Signal animation |
|---|---|---|---|
| IMPORT | Thin tube | Indigo | static |
| CALL | Tube + arrowhead | Cyan | FlowParticle |
| INHERITANCE | Double-width tube | Orange | static |
| DATA_FLOW | Dashed (UV-scroll) | Pink | FlowParticle |
| EXPORT | Dotted tube | Gray | static |

## Signal Animation (`animation/SignalAnimator.ts`)
- Receives `SignalSimulation` from API
- RAF loop with virtual clock (speed 0.5×–4×, pause/scrub)
- Per frame: PulseEffect on active nodes (scale 1→1.4→1 over 600ms)
- Per active edge: FlowParticle spawns emissive sphere, travels Bézier curve, self-destructs
- Camera drifts gently toward centroid of active nodes (CameraAnimator.focusOnSet)
- Floating state-delta labels tween in/hold/out above affected nodes

## Interaction (`interaction/PickManager.ts`)
- `pc.Picker` (quarter-res off-screen buffer) on pointerup
- Maps picked entity → GraphNode via NodeFactory Map<nodeId, Entity>
- Dispatches to Zustand `graph-store.selectedNodeId`

## State (Zustand)
```
repo-store:    repos[], activeRepoId, importJob { jobId, phase, pct }
graph-store:   snapshot, filteredNodeIds, selectedNodeId, visibleEdgeKinds
signal-store:  simulation, playback { state, frameIdx, speed }
```
`SceneManager` subscribes to Zustand stores from outside React to react to graph changes.

## React UI Panels (outside PlayCanvas canvas)
- `ImportPanel` — GitHub login button → OAuth redirect, then URL input + import progress bar
- `NodeInspector` — sidebar: name, kind, file, metrics, outgoing calls list
- `SignalLauncher` — pick seed node, set maxHops/speed, play/pause/scrub timeline
- `GraphControls` — filter by module path, toggle edge kinds, search nodes
- `LegendOverlay` — shape/color legend always visible

---

# Critical Files (implement in this order)

1. `packages/types/src/graph.ts` — data model everything else depends on
2. `apps/api/src/services/parser/js-ts-parser.ts` — AST extraction
3. `apps/api/src/services/graph/builder.ts` + `enricher.ts` — graph merge
4. `apps/api/src/routes/` + `auth/github.ts` — OAuth + API surface
5. `apps/app/src/visualizer/scene/SceneManager.ts` — PlayCanvas scene orchestrator
6. `apps/app/src/visualizer/animation/SignalAnimator.ts` — signal playback

---

# Implementation Phases

**Phase 1 — Foundation**: pnpm workspace, shared types, Fastify health route, Drizzle/SQLite, GitHub OAuth flow  
**Phase 2 — Parser + Graph Pipeline**: js-ts-parser, graph builder/enricher/clusterer/layout, BullMQ import worker, all API routes, socket.io  
**Phase 3 — PlayCanvas Core**: Application singleton, camera, lighting, node meshes, SDF labels, edge tubes  
**Phase 4 — Interaction + Animation**: PickManager, HoverEffect, PulseEffect, FlowParticle, SignalAnimator, CameraAnimator  
**Phase 5 — React UI + Integration**: Zustand stores, API client, socket client, all UI panels, end-to-end wiring  
**Phase 6 — Polish**: LOD (hide labels/edges beyond distance threshold), cluster collapse/expand with tween, subgraph filtering, error surfaces

---

# Verification

1. **Parser unit tests**: feed fixture TS files, assert expected nodes/edges in output
2. **Graph pipeline integration test**: POST a small public GitHub repo URL (e.g. `https://github.com/nicolo-ribaudo/tc39-proposal-enum`), assert `GraphSnapshot` contains nodes for all exported declarations
3. **Signal simulation test**: seed from a known leaf node, assert `SignalFrame[]` length = expected call depth
4. **PlayCanvas smoke test**: load hard-coded GraphSnapshot, confirm all nodes render with correct shapes and edges connect correct endpoints
5. **E2E**: Login via GitHub OAuth → import real repo → visualize → click a function node → launch signal → confirm animation plays through connected nodes
