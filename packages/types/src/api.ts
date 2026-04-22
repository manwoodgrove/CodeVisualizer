import type { GraphSnapshot, RepoMeta } from './graph.js';
import type { SignalSimulation } from './signal.js';

export interface ImportRepoRequest {
  url: string;
  branch?: string;
}

export interface ImportRepoResponse {
  jobId: string;
  repoId: string;
}

export interface GetGraphResponse {
  snapshot: GraphSnapshot;
}

export interface GetRepoResponse {
  repo: RepoMeta;
}

export interface ListReposResponse {
  repos: RepoMeta[];
}

export interface SimulateSignalResponse {
  simulation: SignalSimulation;
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

export interface AuthMeResponse {
  authenticated: boolean;
  user?: {
    login: string;
    avatarUrl: string;
    name?: string;
  };
}

export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  stars: number;
  language: string | null;
  pushedAt: string;
  defaultBranch: string;
  htmlUrl: string;
}

export interface ListGitHubReposResponse {
  repos: GitHubRepoSummary[];
}
