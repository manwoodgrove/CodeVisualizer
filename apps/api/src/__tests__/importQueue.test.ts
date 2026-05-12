import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startImportWorker, enqueueImport, importQueue } from '../queue/importQueue.js';
import { Queue, Worker } from 'bullmq';
import { updateRepoStatus, saveSnapshot } from '../db/repos.js';

// Mock dependencies
vi.mock('ioredis', () => ({
  Redis: vi.fn()
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn()
  })),
  Worker: vi.fn().mockImplementation((name, processor) => {
    return {
      on: vi.fn(),
      // expose processor for testing
      _processor: processor
    };
  })
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-job-id'
}));

vi.mock('../db/repos.js', () => ({
  updateRepoStatus: vi.fn(),
  saveSnapshot: vi.fn()
}));

vi.mock('../services/pipeline/runImport.js', () => ({
  runImport: vi.fn()
}));

describe('importQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info'
  } as any;

  describe('startImportWorker', () => {
    it('should initialize worker with correct name', () => {
      const ioMock = { to: vi.fn() } as any;
      const worker = startImportWorker(ioMock, mockLogger);
      expect(Worker).toHaveBeenCalledWith('import', expect.any(Function), expect.any(Object));

      // verify error handler attachment
      expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should process a successful job', async () => {
      const ioMock = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
      } as any;

      const { runImport } = await import('../services/pipeline/runImport.js');
      const mockSnapshot = { nodes: [{id: '1'}], edges: [], stats: { nodeCount: 1, edgeCount: 0 } };
      vi.mocked(runImport).mockResolvedValueOnce(mockSnapshot as any);

      const worker: any = startImportWorker(ioMock, mockLogger);

      const mockJob = {
        data: {
          jobId: 'job-123',
          repoId: 'repo-456',
          url: 'http://test',
          token: 'token123'
        }
      };

      await worker._processor(mockJob);

      expect(updateRepoStatus).toHaveBeenCalledWith('repo-456', { status: 'fetching' });
      expect(runImport).toHaveBeenCalledWith({
        token: 'token123',
        url: 'http://test',
        branch: undefined,
        onProgress: expect.any(Function)
      });

      expect(saveSnapshot).toHaveBeenCalledWith('repo-456', mockSnapshot);
      expect(updateRepoStatus).toHaveBeenCalledWith('repo-456', {
        status: 'ready',
        nodeCount: 1,
        edgeCount: 0
      });

      expect(ioMock.to).toHaveBeenCalledWith('job-123');
      expect(ioMock.emit).toHaveBeenCalledWith('job:done', { jobId: 'job-123', repoId: 'repo-456' });
    });

    it('should emit progress events correctly', async () => {
      const ioMock = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
      } as any;

      const { runImport } = await import('../services/pipeline/runImport.js');
      vi.mocked(runImport).mockImplementationOnce(async ({ onProgress }: any) => {
        onProgress('fetch', 50);
        return { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0 } } as any;
      });

      const worker: any = startImportWorker(ioMock, mockLogger);

      const mockJob = {
        data: { jobId: 'job-123', repoId: 'repo-456', url: 'http://test', token: 'test' }
      };

      await worker._processor(mockJob);

      expect(ioMock.to).toHaveBeenCalledWith('job-123');
      expect(ioMock.emit).toHaveBeenCalledWith('job:progress', { jobId: 'job-123', phase: 'fetch', pct: 50 });
    });

    it('should handle job failure and update status', async () => {
      const ioMock = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
      } as any;

      const { runImport } = await import('../services/pipeline/runImport.js');
      const testError = new Error('Import failed');
      vi.mocked(runImport).mockRejectedValueOnce(testError);

      const worker: any = startImportWorker(ioMock, mockLogger);

      const mockJob = {
        data: { jobId: 'job-123', repoId: 'repo-456', url: 'http://test', token: 'test' }
      };

      await expect(worker._processor(mockJob)).rejects.toThrow('Import failed');

      expect(updateRepoStatus).toHaveBeenCalledWith('repo-456', { status: 'error', error: 'Import failed' });
      expect(ioMock.to).toHaveBeenCalledWith('job-123');
      expect(ioMock.emit).toHaveBeenCalledWith('job:error', { jobId: 'job-123', message: 'Import failed' });
    });
  });

  describe('enqueueImport', () => {
    it('should add a job to the queue with correct parameters', async () => {
      const mockData = {
        repoId: 'repo-456',
        url: 'http://test',
        token: 'token123'
      };

      const jobId = await enqueueImport(mockData);

      expect(jobId).toBe('test-job-id');
      expect(importQueue.add).toHaveBeenCalledWith(
        'import',
        { ...mockData, jobId: 'test-job-id' },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
      );
    });
  });
});
