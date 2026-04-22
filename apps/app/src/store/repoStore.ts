import { create } from 'zustand'
import type { RepoMeta } from '@cv/types'
import type { JobPhase } from '@cv/types'

export interface ImportJob {
  jobId: string
  phase: JobPhase
  pct: number
  message?: string
}

interface RepoState {
  repos: RepoMeta[]
  activeRepoId: string | null
  importJob: ImportJob | null
  setRepos: (repos: RepoMeta[]) => void
  setActiveRepoId: (id: string | null) => void
  setImportJob: (job: ImportJob) => void
  clearImportJob: () => void
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],
  activeRepoId: null,
  importJob: null,
  setRepos: (repos) => set({ repos }),
  setActiveRepoId: (id) => set({ activeRepoId: id }),
  setImportJob: (job) => set({ importJob: job }),
  clearImportJob: () => set({ importJob: null }),
}))
