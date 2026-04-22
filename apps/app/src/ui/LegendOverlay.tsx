import { useState } from 'react'

interface LegendEntry {
  label: string
  color: string
  shape: 'circle' | 'square'
}

const NODE_KINDS: LegendEntry[] = [
  { label: 'Module',   color: 'var(--color-module)',   shape: 'circle' },
  { label: 'Class',    color: 'var(--color-class)',    shape: 'square' },
  { label: 'Function', color: 'var(--color-function)', shape: 'circle' },
  { label: 'Method',   color: 'var(--color-method)',   shape: 'circle' },
  { label: 'Variable', color: 'var(--color-variable)', shape: 'square' },
]

const EDGE_KINDS: LegendEntry[] = [
  { label: 'Import',      color: 'var(--color-import)',      shape: 'square' },
  { label: 'Call',        color: 'var(--color-call)',        shape: 'square' },
  { label: 'Inheritance', color: 'var(--color-inheritance)', shape: 'square' },
  { label: 'Data Flow',   color: 'var(--color-data-flow)',   shape: 'square' },
  { label: 'Export',      color: 'var(--color-export)',      shape: 'square' },
]

export function LegendOverlay() {
  const [visible, setVisible] = useState(true)

  if (!visible) {
    return (
      <button
        className="btn--icon"
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 10,
          fontSize: 11,
        }}
        onClick={() => setVisible(true)}
      >
        Legend
      </button>
    )
  }

  return (
    <div className="legend-overlay">
      <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="panel-title" style={{ margin: 0 }}>Legend</span>
        <button className="btn--icon" onClick={() => setVisible(false)}>x</button>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div className="metric-label" style={{ marginBottom: 4 }}>Nodes</div>
        {NODE_KINDS.map((entry) => (
          <div key={entry.label} className="legend-row">
            <div
              className={`legend-swatch${entry.shape === 'circle' ? ' legend-swatch--circle' : ''}`}
              style={{ background: entry.color }}
            />
            <span>{entry.label}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="metric-label" style={{ marginBottom: 4 }}>Edges</div>
        {EDGE_KINDS.map((entry) => (
          <div key={entry.label} className="legend-row">
            <div className="legend-swatch" style={{ background: entry.color, borderRadius: 1, height: 3, width: 16, alignSelf: 'center' }} />
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
