import type {
  RepoMeta, ImportRepoRequest, ImportRepoResponse,
  GraphSnapshot, SimulateSignalRequest, SignalSimulation,
} from '@codevisualizer/types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  repos: {
    list: () => request<RepoMeta[]>('/repos'),
    get: (id: string) => request<RepoMeta>(`/repos/${id}`),
    import: (body: ImportRepoRequest) =>
      request<ImportRepoResponse>('/repos/import', { method: 'POST', body: JSON.stringify(body) }),
    graph: (id: string, params?: { module?: string; depth?: number }) => {
      const qs = new URLSearchParams();
      if (params?.module) qs.set('module', params.module);
      if (params?.depth !== undefined) qs.set('depth', String(params.depth));
      return request<GraphSnapshot>(`/repos/${id}/graph?${qs}`);
    },
    simulate: (id: string, body: SimulateSignalRequest) =>
      request<SignalSimulation>(`/repos/${id}/signals/simulate`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  auth: {
    me: () => request<{ login: string }>('/auth/me').catch(() => null),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
};
