import { useAuthStore } from '../store/authStore.js'
import { useRepoStore } from '../store/repoStore.js'

export function TopBar() {
  const { user, logout } = useAuthStore()
  const { repos, activeRepoId } = useRepoStore()

  const activeRepo = repos.find((r) => r.id === activeRepoId)

  return (
    <header className="topbar app-topbar">
      <div className="topbar__logo">Code Visualizer</div>

      {activeRepo && (
        <div className="topbar__repo">
          {activeRepo.name}
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
            ({activeRepo.branch})
          </span>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {user ? (
        <div className="topbar__user">
          <img
            className="topbar__avatar"
            src={user.avatarUrl}
            alt={user.login}
          />
          <span className="topbar__login">{user.name ?? user.login}</span>
          <button className="btn--danger" onClick={() => logout()}>
            Logout
          </button>
        </div>
      ) : (
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not signed in</span>
      )}
    </header>
  )
}
