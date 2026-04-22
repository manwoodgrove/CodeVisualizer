import { create } from 'zustand';
import type { RepoMeta } from '@codevisualizer/types';
import type { JobProgressEvent } from '@codevisualizer/types';
import { api } from '../api/client.js';
import { useGraphStore } from './graph-store.js';

interface ImportJobState {
  jobId: string;
  phase: string;
  pct: number;
  message?: string;
}

interface RepoState {
  repos: RepoMeta[];
  activeRepoId: string | null;
  importJob: ImportJobState | null;
  githubUser: string | null;

  loadRepos: () => Promise<void>;
  importRepo: (url: string, branch?: string) => Promise<void>;
  selectRepo: (id: string) => Promise<void>;
  setImportJob: (data: JobProgressEvent) => void;
  onImportDone: (repoId: string) => void;
  onImportError: (message: string) => void;
  setGithubUser: (login: string | null) => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  activeRepoId: null,
  importJob: null,
  githubUser: null,

  loadRepos: async () => {
    const repos = await api.repos.list();
    set({ repos });
  },

  importRepo: async (url, branch) => {
    const { jobId, repoId } = await api.repos.import({ url, branch });
    set({ importJob: { jobId, phase: 'fetch', pct: 0 }, activeRepoId: repoId });
  },

  selectRepo: async (id) => {
    set({ activeRepoId: id });
    const snapshot = await api.repos.graph(id);
    useGraphStore.getState().setSnapshot(snapshot);
  },

  setImportJob: (data) => {
    set({ importJob: { jobId: data.jobId, phase: data.phase, pct: data.pct, message: data.message } });
  },

  onImportDone: (repoId) => {
    set({ importJob: null });
    get().selectRepo(repoId);
    get().loadRepos();
  },

  onImportError: (message) => {
    set({ importJob: { jobId: '', phase: 'error', pct: 0, message } });
  },

  setGithubUser: (login) => set({ githubUser: login }),
}));
