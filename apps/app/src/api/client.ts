import type {
  AuthMeResponse,
  ListReposResponse,
  GetRepoResponse,
  ImportRepoResponse,
  GetGraphResponse,
  SimulateSignalResponse,
  ListGitHubReposResponse,
} from '@cv/types'
import type { SimulateSignalRequest } from '@cv/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  me(): Promise<AuthMeResponse> {
    return request<AuthMeResponse>('/auth/me')
  },

  listRepos(): Promise<ListReposResponse> {
    return request<ListReposResponse>('/api/repos')
  },

  listGitHubRepos(): Promise<ListGitHubReposResponse> {
    return request<ListGitHubReposResponse>('/api/github/repos')
  },

  getRepo(id: string): Promise<GetRepoResponse> {
    return request<GetRepoResponse>(`/api/repos/${id}`)
  },

  importRepo(url: string, branch?: string): Promise<ImportRepoResponse> {
    return request<ImportRepoResponse>('/api/repos/import', {
      method: 'POST',
      body: JSON.stringify({ url, branch }),
    })
  },

  getGraph(id: string, opts?: { module?: string; depth?: number }): Promise<GetGraphResponse> {
    const params = new URLSearchParams()
    if (opts?.module) params.set('module', opts.module)
    if (opts?.depth != null) params.set('depth', String(opts.depth))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<GetGraphResponse>(`/api/repos/${id}/graph${qs}`)
  },

  simulate(repoId: string, body: SimulateSignalRequest): Promise<SimulateSignalResponse> {
    return request<SimulateSignalResponse>(`/api/repos/${repoId}/simulate`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST' })
  },

  githubLoginUrl: '/auth/github' as const,
}
