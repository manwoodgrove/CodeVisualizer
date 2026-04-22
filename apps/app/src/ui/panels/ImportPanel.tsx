import { useState, useEffect } from 'react';
import { useRepoStore } from '../../store/repo-store.js';
import { api } from '../../api/client.js';

export function ImportPanel() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const { importRepo, importJob, loadRepos, repos, selectRepo, githubUser, setGithubUser } = useRepoStore();

  useEffect(() => {
    api.auth.me().then(me => { if (me) setGithubUser(me.login); });
    loadRepos();
  }, []);

  const handleImport = async () => {
    if (!url.trim()) return;
    await importRepo(url.trim(), branch.trim() || undefined);
  };

  const isImporting = !!importJob && importJob.phase !== 'error';

  return (
    <div style={panel}>
      <div style={authRow}>
        {githubUser ? (
          <span style={userStyle}>
            <span style={dot} />
            {githubUser}
          </span>
        ) : (
          <a href="/auth/github" style={loginBtn}>Connect GitHub</a>
        )}
      </div>

      <h2 style={heading}>Import Repository</h2>

      <input
        style={inputStyle}
        placeholder="https://github.com/owner/repo"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleImport()}
        disabled={isImporting}
      />
      <input
        style={{ ...inputStyle, fontSize: 11, opacity: 0.7 }}
        placeholder="Branch (optional, default HEAD)"
        value={branch}
        onChange={e => setBranch(e.target.value)}
        disabled={isImporting}
      />

      <button style={btn} onClick={handleImport} disabled={isImporting || !url.trim()}>
        {isImporting ? 'Importing…' : 'Visualize'}
      </button>

      {importJob && (
        <div style={progressWrap}>
          <div style={{ ...bar, width: `${importJob.pct}%` }} />
          <span style={phase}>{importJob.phase} {importJob.pct}%</span>
          {importJob.message && <span style={{ color: '#f87171', fontSize: 11 }}>{importJob.message}</span>}
        </div>
      )}

      {repos.length > 0 && (
        <div style={repoList}>
          <div style={repoListLabel}>Recent repos</div>
          {repos.map(r => (
            <button key={r.id} style={repoItem} onClick={() => selectRepo(r.id)}>
              <span style={statusDot(r.status)} />
              <span>{r.name}</span>
              <span style={repoMeta}>{r.nodeCount}n</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function statusDot(status: string): React.CSSProperties {
  return {
    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
    background: status === 'ready' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59e0b',
  };
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 56, left: 12, width: 280,
  background: 'rgba(10,10,20,0.9)', backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
  padding: 14, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8,
};
const heading: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: 0 };
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '6px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%',
};
const btn: React.CSSProperties = {
  background: '#2563eb', border: 'none', borderRadius: 6, padding: '7px 14px',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const progressWrap: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px',
  position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3,
};
const bar: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(37,99,235,0.25)',
  transition: 'width 0.3s ease', height: '100%',
};
const phase: React.CSSProperties = { fontSize: 11, color: '#93c5fd', position: 'relative' };
const authRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' };
const userStyle: React.CSSProperties = { fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 };
const dot: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' };
const loginBtn: React.CSSProperties = {
  fontSize: 11, color: '#60a5fa', textDecoration: 'none',
  border: '1px solid rgba(96,165,250,0.3)', borderRadius: 4, padding: '2px 8px',
};
const repoList: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2,
};
const repoListLabel: React.CSSProperties = {
  fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
};
const repoItem: React.CSSProperties = {
  background: 'transparent', border: 'none', borderRadius: 5, padding: '4px 6px',
  color: '#cbd5e1', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
};
const repoMeta: React.CSSProperties = { marginLeft: 'auto', fontSize: 10, color: '#475569' };
