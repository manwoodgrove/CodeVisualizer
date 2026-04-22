import type { FastifyPluginAsync } from 'fastify';
import { enqueueImport } from '../jobs/import-worker.js';
import { getRepo, loadSnapshot, listRepos } from '../db/repos.js';
import { simulateSignal } from '../services/simulator/tracer.js';

const reposRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/repos
  fastify.get('/', async (_req, reply) => {
    return listRepos();
  });

  // POST /api/repos/import
  fastify.post<{ Body: { url: string; branch?: string } }>(
    '/import',
    async (req, reply) => {
      const { url, branch } = req.body;
      if (!url) return reply.status(400).send({ error: 'url is required' });

      const session = req.session as unknown as Record<string, unknown>;
      const token = session?.githubToken as string | undefined;

      const result = await enqueueImport({ url, branch, token });
      return reply.status(202).send(result);
    },
  );

  // GET /api/repos/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const repo = await getRepo(req.params.id);
    if (!repo) return reply.status(404).send({ error: 'Not found' });
    return repo;
  });

  // GET /api/repos/:id/graph
  fastify.get<{
    Params: { id: string };
    Querystring: { module?: string; depth?: string };
  }>('/:id/graph', async (req, reply) => {
    const snapshot = await loadSnapshot(req.params.id);
    if (!snapshot) return reply.status(404).send({ error: 'Graph not found' });

    const { module: moduleFilter, depth } = req.query;
    if (!moduleFilter) return snapshot;

    // BFS subgraph filtering
    const maxDepth = parseInt(depth ?? '2', 10);
    const seedIds = snapshot.nodes
      .filter(n => n.filePath.includes(moduleFilter))
      .map(n => n.id);

    const edgeIndex = new Map<string, string[]>();
    for (const e of snapshot.edges) {
      const arr = edgeIndex.get(e.source) ?? [];
      arr.push(e.target);
      edgeIndex.set(e.source, arr);
    }

    const included = new Set(seedIds);
    let frontier = seedIds;
    for (let d = 0; d < maxDepth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const tgt of edgeIndex.get(id) ?? []) {
          if (!included.has(tgt)) { included.add(tgt); next.push(tgt); }
        }
      }
      frontier = next;
    }

    return {
      ...snapshot,
      nodes: snapshot.nodes.filter(n => included.has(n.id)),
      edges: snapshot.edges.filter(e => included.has(e.source) && included.has(e.target)),
    };
  });

  // POST /api/repos/:id/signals/simulate
  fastify.post<{
    Params: { id: string };
    Body: { seedNodeId: string; maxHops?: number; direction?: 'forward' | 'backward' | 'both' };
  }>('/:id/signals/simulate', async (req, reply) => {
    const snapshot = await loadSnapshot(req.params.id);
    if (!snapshot) return reply.status(404).send({ error: 'Graph not found' });

    const { seedNodeId, maxHops = 5, direction = 'forward' } = req.body;
    const sim = simulateSignal(seedNodeId, snapshot.nodes, snapshot.edges, maxHops, direction);
    return sim;
  });
};

export default reposRoutes;
