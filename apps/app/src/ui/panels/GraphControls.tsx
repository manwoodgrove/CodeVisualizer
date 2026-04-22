import { useGraphStore } from '../../store/graph-store.js';
import type { EdgeKind } from '@codevisualizer/types';

const EDGE_KINDS: Array<{ kind: EdgeKind; label: string; color: string }> = [
  { kind: 'IMPORT',      label: 'Import',      color: '#6366f1' },
  { kind: 'CALL',        label: 'Call',         color: '#06b6d4' },
  { kind: 'INHERITANCE', label: 'Extends',      color: '#ea580c' },
  { kind: 'DATA_FLOW',   label: 'Data Flow',    color: '#db2777' },
  { kind: 'EXPORT',      label: 'Export',       color: '#94a3b8' },
];

export function GraphControls() {
  const { snapshot, visibleEdgeKinds, toggleEdgeKind, setSearch, searchQuery } = useGraphStore();

  if (!snapshot) return null;

  return (
    <div style={styles.bar}>
      <input
        style={styles.search}
        placeholder="Search nodes…"
        value={searchQuery}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={styles.divider} />
      {EDGE_KINDS.map(({ kind, label, color }) => (
        <button
          key={kind}
          style={{
            ...styles.pill,
            borderColor: color,
            color: visibleEdgeKinds.has(kind) ? '#fff' : '#475569',
            background: visibleEdgeKinds.has(kind) ? `${color}33` : 'transparent',
          }}
          onClick={() => toggleEdgeKind(kind)}
          title={label}
        >
          <span style={{ ...styles.pillDot, background: color }} />
          {label}
        </button>
      ))}
      <div style={styles.stats}>
        {snapshot.nodes.length}n · {snapshot.edges.length}e
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  search: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '3px 10px',
    color: '#e2e8f0',
    fontSize: 12,
    outline: 'none',
    width: 160,
  },
  divider: { width: 1, height: 20, background: 'rgba(255,255,255,0.08)', marginLeft: 4 },
  pill: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s',
  },
  pillDot: { width: 6, height: 6, borderRadius: '50%' },
  stats: { marginLeft: 'auto', fontSize: 11, color: '#475569' },
};
