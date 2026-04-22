import { useState } from 'react';

const NODE_LEGEND = [
  { shape: '⬡', label: 'Module',   color: '#1d4ed8' },
  { shape: '◈', label: 'Class',    color: '#d97706' },
  { shape: '●', label: 'Function', color: '#059669' },
  { shape: '◉', label: 'Method',   color: '#0891b2' },
  { shape: '◆', label: 'Variable', color: '#64748b' },
];

const EDGE_LEGEND = [
  { color: '#6366f1', label: 'Import' },
  { color: '#06b6d4', label: 'Call →' },
  { color: '#ea580c', label: 'Extends' },
  { color: '#db2777', label: 'Data flow' },
  { color: '#94a3b8', label: 'Export' },
];

export function LegendOverlay() {
  const [open, setOpen] = useState(true);

  return (
    <div style={styles.wrap}>
      <button style={styles.toggle} onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Legend
      </button>
      {open && (
        <div style={styles.body}>
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Nodes</div>
            {NODE_LEGEND.map(item => (
              <div key={item.label} style={styles.row}>
                <span style={{ ...styles.nodeShape, color: item.color }}>{item.shape}</span>
                <span style={styles.label}>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Connections</div>
            {EDGE_LEGEND.map(item => (
              <div key={item.label} style={styles.row}>
                <span style={{ ...styles.edgeLine, background: item.color }} />
                <span style={styles.label}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    bottom: 16,
    right: 12,
    background: 'rgba(10,10,20,0.88)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    zIndex: 100,
    minWidth: 130,
  },
  toggle: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: 11,
    padding: '6px 10px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  body: { padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 8 },
  section: { display: 'flex', flexDirection: 'column', gap: 3 },
  sectionLabel: { fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 7 },
  nodeShape: { fontSize: 13, lineHeight: 1, width: 14, textAlign: 'center' },
  edgeLine: { width: 14, height: 2, borderRadius: 1, flexShrink: 0 },
  label: { fontSize: 11, color: '#cbd5e1' },
};
