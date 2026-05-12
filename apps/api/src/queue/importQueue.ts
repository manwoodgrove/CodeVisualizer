import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { GraphSnapshot } from '@cv/types';
import { config } from '../config.js';
import { saveSnapshot, updateRepoStatus } from '../db/repos.js';

export interface ImportJobData {
  jobId: string;
  repoId: string;
  url: string;
  branch?: string;
  token: string;
}

const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
});

export const importQueue = new Queue<ImportJobData>('import', { connection });

export function startImportWorker(
  io: Server,
  logger: FastifyInstance['log']
): Worker<ImportJobData> {
  const workerConnection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<ImportJobData>(
    'import',
    async (job) => {
      const { jobId, repoId, url, branch, token } = job.data;

      // Dynamically import to avoid circular deps and respect that
      // the services folder is owned by another agent.
      type ImportContext = {
        token: string;
        url: string;
        branch?: string;
        onProgress: (phase: 'fetch' | 'parse' | 'layout', pct: number) => void;
      };
      const { runImport } = await import(
        '../services/pipeline/runImport.js'
      ) as { runImport: (ctx: ImportContext) => Promise<GraphSnapshot> };

      logger.info(
        { jobId, repoId, url, branch: branch ?? 'default' },
        'Import started'
      );
      await updateRepoStatus(repoId, { status: 'fetching' });

      let snapshot: GraphSnapshot;
      try {
        const lastLoggedPct: Record<string, number> = {};
        snapshot = await runImport({
          token,
          url,
          branch,
          onProgress: (phase, pct) => {
            io.to(jobId).emit('job:progress', { jobId, phase, pct });
            const prev = lastLoggedPct[phase] ?? -1;
            if (pct === 0 || pct === 100 || pct - prev >= 20) {
              logger.info({ jobId, phase, pct }, 'Import progress');
              lastLoggedPct[phase] = pct;
            }
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ jobId, err }, 'Import failed');
        await updateRepoStatus(repoId, { status: 'error', error: message });
        io.to(jobId).emit('job:error', { jobId, message });
        throw err;
      }

      logger.info(
        {
          jobId,
          repoId,
          nodes: snapshot.nodes.length,
          edges: snapshot.edges.length,
        },
        'Saving snapshot'
      );
      await saveSnapshot(repoId, snapshot);
      await updateRepoStatus(repoId, {
        status: 'ready',
        nodeCount: snapshot.nodes.length,
        edgeCount: snapshot.edges.length,
      });

      io.to(jobId).emit('job:done', { jobId, repoId });
      logger.info({ jobId, repoId }, 'Import completed');
    },
    { connection: workerConnection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Import job failed');
  });

  return worker;
}

/** Convenience: enqueue an import job and return the generated jobId */
export async function enqueueImport(data: Omit<ImportJobData, 'jobId'>): Promise<string> {
  const jobId = nanoid();
  await importQueue.add('import', { ...data, jobId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  return jobId;
}
