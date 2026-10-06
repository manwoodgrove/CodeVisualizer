import { useEffect, useMemo, useState } from 'react'
import type { GitHubRepoSummary } from '@cv/types'
import { api } from '../api/client.js'
import { connectJobSocket } from '../api/socket.js'
import { useRepoStore } from '../store/repoStore.js'
import { useGraphStore } from '../store/graphStore.js'

export function useImportPanel() {
  const { importJob, setImportJob, clearImportJob, setActiveRepoId } = useRepoStore()
  const setSnapshot = useGraphStore((s) => s.setSnapshot)

  const [ghRepos, setGhRepos] = useState<GitHubRepoSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyRepo, setBusyRepo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listGitHubRepos()
      .then(({ repos }) => {
        if (!cancelled) setGhRepos(repos)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load repositories')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    if (!ghRepos) return []
    const q = filter.trim().toLowerCase()
    if (!q) return ghRepos
    return ghRepos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)),
    )
  }, [ghRepos, filter])

  async function startImport(repo: GitHubRepoSummary) {
    setError(null)
    setBusyRepo(repo.fullName)
    try {
      const { jobId, repoId } = await api.importRepo(repo.htmlUrl, repo.defaultBranch)
      setImportJob({ jobId, phase: 'fetch', pct: 0 })

      const unsub = connectJobSocket(jobId, {
        onProgress: (ev) => {
          setImportJob({ jobId, phase: ev.phase, pct: ev.pct, message: ev.message })
        },
        onDone: async (ev) => {
          unsub()
          setActiveRepoId(ev.repoId)
          try {
            const { snapshot } = await api.getGraph(ev.repoId)
            setSnapshot(snapshot)
          } catch {
            /* non-fatal */
          }
          clearImportJob()
          setBusyRepo(null)
        },
        onError: (ev) => {
          unsub()
          setError(ev.message)
          clearImportJob()
          setBusyRepo(null)
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setBusyRepo(null)
    }
  }

  return {
    importJob,
    ghRepos,
    filtered,
    loading,
    filter,
    setFilter,
    error,
    busyRepo,
    startImport,
  }
}
