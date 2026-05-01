import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
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

export function startImportWorker(io: Server): Worker<ImportJobData> {
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

      console.log(`[import ${jobId}] start repoId=${repoId} url=${url} branch=${branch ?? 'default'}`);
      await updateRepoStatus(repoId, { status: 'fetching' });

      let snapshot: GraphSnapshot;
      let lastLoggedPct: Record<string, number> = {};
      try {
        snapshot = await runImport({
          token,
          url,
          branch,
          onProgress: (phase, pct) => {
            io.to(jobId).emit('job:progress', { jobId, phase, pct });
            const prev = lastLoggedPct[phase] ?? -1;
            if (pct === 0 || pct === 100 || pct - prev >= 20) {
              console.log(`[import ${jobId}] ${phase} ${pct}%`);
              lastLoggedPct[phase] = pct;
            }
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[import ${jobId}] FAILED: ${message}`);
        await updateRepoStatus(repoId, { status: 'error', error: message });
        io.to(jobId).emit('job:error', { jobId, message });
        throw err;
      }

      console.log(`[import ${jobId}] saving snapshot nodes=${snapshot.nodes.length} edges=${snapshot.edges.length}`);
      await saveSnapshot(repoId, snapshot);
      await updateRepoStatus(repoId, {
        status: 'ready',
        nodeCount: snapshot.nodes.length,
        edgeCount: snapshot.edges.length,
      });

      io.to(jobId).emit('job:done', { jobId, repoId });
    },
    { connection: workerConnection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[importWorker] job ${job?.id} failed:`, err);
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
