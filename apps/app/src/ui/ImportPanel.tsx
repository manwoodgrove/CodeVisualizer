import type { GitHubRepoSummary } from '@cv/types'
import { useImportPanel } from '../hooks/useImportPanel.js'

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / 86400 / 30)}mo ago`
  return `${Math.floor(diffSec / 86400 / 365)}y ago`
}

function RepoRow({
  repo,
  busy,
  disabled,
  onClick,
}: {
  repo: GitHubRepoSummary
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`repo-row ${busy ? 'repo-row--busy' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={repo.description ?? ''}
    >
      <div className="repo-row__head">
        <span className="repo-row__name">{repo.fullName}</span>
        {repo.private && <span className="repo-badge">private</span>}
        {repo.fork && <span className="repo-badge repo-badge--muted">fork</span>}
      </div>
      {repo.description && <div className="repo-row__desc">{repo.description}</div>}
      <div className="repo-row__meta">
        {repo.language && <span>{repo.language}</span>}
        <span>★ {repo.stars}</span>
        <span>pushed {relativeTime(repo.pushedAt)}</span>
        {busy && <span className="repo-row__status">importing...</span>}
      </div>
    </button>
  )
}

function ImportProgress({
  phase,
  pct,
  message,
}: {
  phase: string
  pct: number
  message?: string
}) {
  return (
    <div className="mt-8">
      <div className="flex-row" style={{ justifyContent: 'space-between' }}>
        <span className="metric-label">{phase}</span>
        <span className="metric-label">{pct}%</span>
      </div>
      {message && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
          {message}
        </div>
      )}
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ImportPanel() {
  const {
    importJob,
    ghRepos,
    filtered,
    loading,
    filter,
    setFilter,
    error,
    busyRepo,
    startImport,
  } = useImportPanel()

  return (
    <div className="panel panel--picker">
      <div className="panel-title">Select a Repository</div>

      <input
        type="search"
        aria-label="Filter repositories by name or description"
        placeholder="Filter by name or description..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={loading || busyRepo !== null}
      />

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
          Loading repositories...
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {ghRepos && ghRepos.length === 0 && !loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
          No repositories found on your account.
        </div>
      )}

      <div className="repo-list">
        {filtered.map((repo) => (
          <RepoRow
            key={repo.fullName}
            repo={repo}
            busy={busyRepo === repo.fullName}
            disabled={busyRepo !== null}
            onClick={() => startImport(repo)}
          />
        ))}
      </div>

      {importJob && (
        <ImportProgress
          phase={importJob.phase}
          pct={importJob.pct}
          message={importJob.message}
        />
      )}
    </div>
  )
}
