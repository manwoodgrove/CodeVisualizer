import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { GraphSnapshot, SignalSimulation } from '@cv/types';
import { requireAuth } from '../auth/github.js';
import {
  createRepo,
  getRepo,
  getSnapshot,
  listRepos,
} from '../db/repos.js';
import { enqueueImport } from '../queue/importQueue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse github.com/<owner>/<repo> from a URL and return a friendly name */
function parseGithubRepo(url: string): { name: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) return null;
    return { name: `${parts[0]}/${parts[1]}` };
  } catch {
    return null;
  }
}

/**
 * BFS sub-snapshot: starting from `startNodeId`, walk up to `depth` hops
 * and return the induced subgraph.
 */
export function bfsSubSnapshot(
  snapshot: GraphSnapshot,
  startNodeId: string,
  depth: number
): GraphSnapshot {
  const nodeIdSet = new Set<string>();
  let frontier = new Set<string>([startNodeId]);
  nodeIdSet.add(startNodeId);

  let adj: Record<string, string[]> | undefined;
  for (let d = 0; d < depth; d++) {
    // Scan the first hop before allocating neighbors. Disconnected roots need
    // just that scan; build the index only when a deeper frontier exists.
    if (d === 1 && depth > 2 && snapshot.edges.length > 0) {
      adj = Object.create(null) as Record<string, string[]>;
      for (const edge of snapshot.edges) {
        (adj[edge.source] ??= []).push(edge.target);
        (adj[edge.target] ??= []).push(edge.source);
      }
    }
    const next = new Set<string>();
    if (adj) {
      for (const nodeId of frontier) {
        for (const neighbor of adj[nodeId] ?? []) {
          if (!nodeIdSet.has(neighbor)) next.add(neighbor);
        }
      }
    } else {
      for (const edge of snapshot.edges) {
        if (frontier.has(edge.source) && !nodeIdSet.has(edge.target)) next.add(edge.target);
        if (frontier.has(edge.target) && !nodeIdSet.has(edge.source)) next.add(edge.source);
      }
    }
    if (next.size === 0) break;
    for (const id of next) nodeIdSet.add(id);
    frontier = next;
  }

  const nodes = snapshot.nodes.filter((n) => nodeIdSet.has(n.id));
  const edges = snapshot.edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
  );

  return {
    ...snapshot,
    nodes,
    edges,
    stats: {
      ...snapshot.stats,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const importBodySchema = z.object({
  url: z.string().url(),
  branch: z.string().optional(),
});

const simulateBodySchema = z.object({
  seedNodeId: z.string(),
  maxHops: z.number().int().positive().optional(),
  bidirectional: z.boolean().optional(),
  frameGapMs: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const reposPlugin: FastifyPluginAsync = async (fastify) => {
  // POST /api/repos/import
  fastify.post(
    '/api/repos/import',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = importBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        });
      }

      const { url, branch } = parsed.data;
      const repoInfo = parseGithubRepo(url);
      if (!repoInfo) {
        return reply.status(400).send({
          error: { code: 'INVALID_URL', message: 'URL must be a github.com repository URL' },
        });
      }

      const repoId = await createRepo({
        url,
        name: repoInfo.name,
        branch: branch ?? 'main',
      });

      const token = request.authContext!.token;
      const jobId = await enqueueImport({ repoId, url, branch, token });

      return reply.status(202).send({ jobId, repoId });
    }
  );

  // GET /api/repos
  fastify.get('/api/repos', { preHandler: requireAuth }, async (_request, reply) => {
    const repos = await listRepos();
    return reply.send({ repos });
  });

  // GET /api/repos/:id
  fastify.get<{ Params: { id: string } }>(
    '/api/repos/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const repo = await getRepo(request.params.id);
      if (!repo) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Repo not found' } });
      }
      return reply.send({ repo });
    }
  );

  // GET /api/repos/:id/graph?module=&depth=
  fastify.get<{
    Params: { id: string };
    Querystring: { module?: string; depth?: string };
  }>(
    '/api/repos/:id/graph',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const { module: moduleId, depth: depthStr } = request.query;

      const snapshot = await getSnapshot(id);
      if (!snapshot) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Graph snapshot not found' },
        });
      }

      if (moduleId) {
        const depth = depthStr !== undefined ? parseInt(depthStr, 10) : 3;
        if (isNaN(depth) || depth < 1) {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'depth must be a positive integer' },
          });
        }
        const node = snapshot.nodes.find(
          (n) => n.id === moduleId || n.filePath === moduleId || n.name === moduleId
        );
        if (!node) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `Node '${moduleId}' not found in snapshot` },
          });
        }
        const sub = bfsSubSnapshot(snapshot, node.id, depth);
        return reply.send({ snapshot: sub });
      }

      return reply.send({ snapshot });
    }
  );

  // POST /api/repos/:id/signals/simulate
  fastify.post<{ Params: { id: string } }>(
    '/api/repos/:id/signals/simulate',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = simulateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        });
      }

      const snapshot = await getSnapshot(request.params.id);
      if (!snapshot) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Graph snapshot not found' },
        });
      }

      const { simulateSignal } = await import(
        '../services/simulator/tracer.js'
      ) as { simulateSignal: (snapshot: GraphSnapshot, seedNodeId: string, opts?: { maxHops?: number; bidirectional?: boolean; frameGapMs?: number }) => SignalSimulation };

      const { seedNodeId, maxHops, bidirectional, frameGapMs } = parsed.data;
      const simulation = simulateSignal(snapshot, seedNodeId, {
        maxHops,
        bidirectional,
        frameGapMs,
      });

      return reply.send({ simulation });
    }
  );
};

export default reposPlugin;
