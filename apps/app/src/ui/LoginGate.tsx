import { api } from '../api/client.js'

export function LoginGate({ loading }: { loading: boolean }) {
  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="login-mark">CV</div>
        <h1 className="login-title">Code Visualizer</h1>
        <p className="login-subtitle">
          Interactive 3D visualization of JavaScript and TypeScript codebases.
          Sign in with GitHub to select a repository and watch signals travel
          through its call graph.
        </p>

        <button
          className="btn--github"
          disabled={loading}
          onClick={() => {
            window.location.href = api.githubLoginUrl
          }}
        >
          <GitHubIcon />
          <span>{loading ? 'Checking session...' : 'Sign in with GitHub'}</span>
        </button>

        <div className="login-note">
          Requires the <code>repo</code> scope to read public and private repositories.
          Tokens are stored encrypted server-side and never shared with third parties.
        </div>
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297a12 12 0 0 0-3.793 23.391c.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.388-1.333-1.757-1.333-1.757-1.09-.745.083-.729.083-.729 1.205.085 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.304 3.495.997.108-.776.418-1.305.762-1.605-2.665-.304-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.22-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.48 11.48 0 0 1 6 0c2.29-1.552 3.296-1.23 3.296-1.23.655 1.652.243 2.873.12 3.176.77.839 1.235 1.91 1.235 3.22 0 4.61-2.807 5.624-5.48 5.921.43.37.813 1.102.813 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.696.825.578A12 12 0 0 0 12 .297Z" />
    </svg>
  )
}
