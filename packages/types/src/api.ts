import type { GraphSnapshot, SignalSimulation } from './graph.js';

export type RepoStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface RepoMeta {
  id: string;
  url: string;
  name: string;
  branch: string;
  status: RepoStatus;
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  createdAt: number;
}

export interface ImportRepoRequest {
  url: string;
  branch?: string;
}

export interface ImportRepoResponse {
  jobId: string;
  repoId: string;
}

export interface SimulateSignalRequest {
  seedNodeId: string;
  maxHops?: number;
  direction?: 'forward' | 'backward' | 'both';
}

export type JobPhase = 'fetch' | 'parse' | 'layout' | 'done' | 'error';

export interface JobProgressEvent {
  jobId: string;
  phase: JobPhase;
  pct: number;
  message?: string;
}

export interface JobDoneEvent {
  jobId: string;
  repoId: string;
}

export interface JobErrorEvent {
  jobId: string;
  message: string;
}

export { GraphSnapshot, SignalSimulation };
