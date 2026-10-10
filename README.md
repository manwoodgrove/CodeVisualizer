# Code Visualizer

See how a JavaScript/TypeScript codebase fits together by walking through it in 3D.

![A codebase rendered as a 3D graph: modules, classes and functions as shapes, calls as lines between them](screenshots/graph-view.png)

Code Visualizer imports a GitHub repository, parses every JS/TS file into a graph of modules, classes, functions and methods, and renders that graph as an interactive PlayCanvas scene. Pick any function and fire a "signal" from it: the call chain lights up hop by hop, so you can watch control flow travel through the codebase instead of reading it file by file.

## What it does

- **Parses source into a graph.** Each file goes through `@typescript-eslint/typescript-estree`. Declarations become nodes; imports, calls and `extends` clauses become edges.
- **Resolves calls across files.** A second pass links call sites to their definitions in other modules, with a type-aware resolver where names alone are ambiguous.
- **Groups and lays out the graph.** Louvain community detection finds clusters of related code; ForceAtlas2 places them in 2D, and each cluster gets its own depth layer so the result reads in 3D.
- **Simulates signals statically.** A breadth-first search over call edges produces one animation frame per hop. Nothing in the target repo is executed.
- **Streams progress live.** Imports run as background jobs and report fetch, parse and layout progress to the browser over WebSockets.

## Architecture

A pnpm monorepo with three packages:

| Package | Role | Main pieces |
|---|---|---|
| `apps/api` | Backend | Fastify, GitHub OAuth, BullMQ + Redis job queue, Socket.IO, SQLite via Drizzle |
| `apps/app` | Frontend | Vite, React, PlayCanvas, Zustand |
| `packages/types` | Shared data model | `GraphNode`, `GraphEdge`, `GraphCluster`, `SignalFrame` |

An import runs as a pipeline:

```
GitHub tree API → fetch JS/TS files → parse to AST → build graph
  → resolve cross-file calls → cluster (Louvain) → layout (ForceAtlas2)
  → save snapshot to SQLite → notify the browser
```

In the scene, node shape encodes kind (module, class, function, method, variable) and size encodes lines of code or complexity. Clusters are drawn as translucent shells, and signals travel along the edges as particles. A level-of-detail manager keeps large repositories responsive.

## Running it

You need a [GitHub OAuth App](https://github.com/settings/developers) so the app can read repositories on your behalf.

```bash
cp apps/api/.env.example apps/api/.env
# fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and a long random SESSION_SECRET
```

**With Docker** (includes Redis):

```bash
make up          # app on http://localhost:38847
```

Register `http://localhost:38847/auth/github/callback` as the OAuth callback URL.

**For development** (requires a local Redis):

```bash
pnpm install
pnpm dev         # API on :4000, app on :5173
```

Register `http://localhost:4000/auth/github/callback` as the OAuth callback URL.

## Tests

```bash
pnpm test        # parser, graph builder, resolver, clustering, layout, queue, crypto
pnpm typecheck
```

## Status

A working prototype. JavaScript and TypeScript only, and signals follow static call edges rather than runtime behaviour, so dynamic dispatch and callbacks passed as values are approximated.
