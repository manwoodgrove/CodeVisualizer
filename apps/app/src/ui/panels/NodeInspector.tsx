import { useGraphStore } from '../../store/graph-store.js';
import { useSignalStore } from '../../store/signal-store.js';

const KIND_ICONS: Record<string, string> = {
  MODULE: '⬡', CLASS: '◈', FUNCTION: '●', METHOD: '◉', VARIABLE: '◆',
};

export function NodeInspector() {
  const { snapshot, selectedNodeId, selectNode } = useGraphStore();
  const { runSimulation } = useSignalStore();

  if (!selectedNodeId || !snapshot) return null;
  const node = snapshot.nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const outEdges = snapshot.edges.filter(e => e.source === node.id && e.kind === 'CALL');
  const inEdges = snapshot.edges.filter(e => e.target === node.id && e.kind === 'CALL');

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.icon}>{KIND_ICONS[node.kind] ?? '●'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.name}>{node.name}</div>
          <div style={styles.path}>{node.filePath}:{node.lineStart}</div>
        </div>
        <button style={styles.close} onClick={() => selectNode(null)}>✕</button>
      </div>

      <div style={styles.chips}>
        <Chip label={node.kind} color="#3b82f6" />
        {node.exported && <Chip label="exported" color="#10b981" />}
        <Chip label={node.language} color="#8b5cf6" />
      </div>

      <div style={styles.metrics}>
        <Metric label="Lines" value={node.metrics.linesOfCode} />
        <Metric label="Complexity" value={node.metrics.cyclomaticComplexity} />
        <Metric label="In calls" value={node.metrics.inDegree} />
        <Metric label="Out calls" value={node.metrics.outDegree} />
      </div>

      {outEdges.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Calls ({outEdges.length})</div>
          {outEdges.slice(0, 6).map(e => {
            const tgt = snapshot.nodes.find(n => n.id === e.target);
            return tgt ? (
              <button key={e.id} style={styles.edgeItem} onClick={() => selectNode(tgt.id)}>
                → {tgt.name}
              </button>
            ) : null;
          })}
        </div>
      )}

      {inEdges.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Called by ({inEdges.length})</div>
          {inEdges.slice(0, 6).map(e => {
            const src = snapshot.nodes.find(n => n.id === e.source);
            return src ? (
              <button key={e.id} style={styles.edgeItem} onClick={() => selectNode(src.id)}>
                ← {src.name}
              </button>
            ) : null;
          })}
        </div>
      )}

      <button
        style={styles.signalBtn}
        onClick={() => runSimulation(node.id)}
      >
        ▶ Execute Signal
      </button>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ ...styles.chip, borderColor: color, color }}>
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 56,
    right: 12,
    width: 256,
    background: 'rgba(10,10,20,0.92)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto',
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  icon: { fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 },
  name: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-all' },
  path: { fontSize: 10, color: '#64748b', wordBreak: 'break-all' },
  close: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0, flexShrink: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: { fontSize: 10, border: '1px solid', borderRadius: 4, padding: '1px 6px' },
  metrics: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  metric: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 5,
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  metricLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' },
  metricValue: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  section: { display: 'flex', flexDirection: 'column', gap: 3 },
  sectionLabel: { fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' },
  edgeItem: {
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '2px 4px',
    color: '#93c5fd',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
  },
  signalBtn: {
    background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
    border: 'none',
    borderRadius: 6,
    padding: '7px 12px',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 2,
  },
};
