import { Worker, Queue } from 'bullmq';
import { nanoid } from 'nanoid';
import type { Server as SocketServer } from 'socket.io';
import { fetchRepoFiles } from '../services/github/fetcher.js';
import { parseFile } from '../services/parser/js-ts-parser.js';
import { buildGraph } from '../services/graph/builder.js';
import { clusterNodes } from '../services/graph/clusterer.js';
import { computeLayout } from '../services/graph/layout.js';
import { createRepo, saveSnapshot, updateRepoStatus } from '../db/repos.js';
import { config } from '../config.js';

export interface ImportJobData {
  jobId: string;
  repoId: string;
  url: string;
  branch: string;
  token?: string;
}

const QUEUE_NAME = 'repo-import';

let queue: Queue | null = null;
let worker: Worker | null = null;
let io: SocketServer | null = null;

export function getImportQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: { url: config.REDIS_URL },
    });
  }
  return queue;
}

export function startImportWorker(socketServer: SocketServer): void {
  io = socketServer;

  worker = new Worker<ImportJobData>(
    QUEUE_NAME,
    async (job) => {
      const { jobId, repoId, url, branch, token } = job.data;

      const emit = (phase: string, pct: number, message?: string) => {
        io?.emit('job:progress', { jobId, phase, pct, message });
      };

      try {
        emit('fetch', 0);
        await createRepo({ id: repoId, url, name: extractRepoName(url), branch });
        await updateRepoStatus(repoId, 'processing');

        const files = await fetchRepoFiles(url, branch, token, (fetched, total) => {
          emit('fetch', Math.round((fetched / total) * 40));
        });

        emit('parse', 40);
        const results = files.map((f, i) => {
          const result = parseFile(f.path, f.content);
          if (i % 10 === 0) emit('parse', 40 + Math.round((i / files.length) * 30));
          return result;
        });

        emit('layout', 70);
        const partialGraph = buildGraph(repoId, extractRepoName(url), results);
        const { nodes: clustered, clusters } = clusterNodes(partialGraph.nodes, partialGraph.edges);
        const { nodes: laid, clusters: laidClusters } = computeLayout(clustered, partialGraph.edges, clusters);

        const snapshot = { ...partialGraph, nodes: laid, clusters: laidClusters };

        emit('layout', 90);
        await saveSnapshot(snapshot);

        emit('done', 100);
        io?.emit('job:done', { jobId, repoId });
      } catch (err: unknown) {
        await updateRepoStatus(repoId, 'error');
        io?.emit('job:error', { jobId, message: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
    { connection: { url: config.REDIS_URL }, concurrency: 2 },
  );
}

export async function enqueueImport(data: {
  url: string;
  branch?: string;
  token?: string;
}): Promise<{ jobId: string; repoId: string }> {
  const jobId = nanoid();
  const repoId = nanoid();
  await getImportQueue().add('import', {
    jobId, repoId, url: data.url, branch: data.branch ?? 'HEAD', token: data.token,
  } satisfies ImportJobData);
  return { jobId, repoId };
}

function extractRepoName(url: string): string {
  return url.replace(/\.git$/, '').split('/').slice(-2).join('/');
}
