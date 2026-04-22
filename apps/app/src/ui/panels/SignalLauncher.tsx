import { useSignalStore } from '../../store/signal-store.js';

export function SignalLauncher() {
  const { simulation, playbackState, frameIdx, speed, play, pause, stop, scrub, setSpeed } = useSignalStore();

  if (!simulation) return null;

  const totalFrames = simulation.frames.length;
  const currentFrame = simulation.frames[frameIdx];
  const progress = totalFrames > 1 ? frameIdx / (totalFrames - 1) : 1;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Signal Propagation</span>
        <button style={styles.close} onClick={stop}>✕</button>
      </div>

      <div style={styles.info}>
        Frame {frameIdx + 1} / {totalFrames}
        {currentFrame && (
          <span style={styles.activeCounts}>
            {currentFrame.activeNodeIds.length} nodes · {currentFrame.activeEdgeIds.length} edges
          </span>
        )}
      </div>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={totalFrames - 1}
        value={frameIdx}
        onChange={e => scrub(Number(e.target.value))}
        style={styles.scrubber}
      />

      {/* Controls */}
      <div style={styles.controls}>
        <button
          style={styles.controlBtn}
          onClick={playbackState === 'playing' ? pause : play}
        >
          {playbackState === 'playing' ? '⏸' : '▶'}
        </button>
        <button style={styles.controlBtn} onClick={stop}>⏹</button>

        {/* Speed */}
        <div style={styles.speedGroup}>
          {[0.5, 1, 2, 4].map(s => (
            <button
              key={s}
              style={{ ...styles.speedBtn, ...(speed === s ? styles.speedActive : {}) }}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* State deltas */}
      {currentFrame?.stateDeltas.length > 0 && (
        <div style={styles.deltas}>
          {currentFrame.stateDeltas.slice(0, 4).map((d, i) => (
            <div key={i} style={styles.delta}>
              <span style={styles.deltaNode}>{d.nodeId.split('::').pop()}</span>
              <span style={styles.deltaArrow}>→</span>
              <span style={styles.deltaValue}>{d.valueAfter}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 360,
    background: 'rgba(10,10,20,0.93)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(124,58,237,0.4)',
    borderRadius: 10,
    padding: 14,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: 600, color: '#c4b5fd' },
  close: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 },
  info: { fontSize: 11, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' },
  activeCounts: { color: '#a78bfa', fontWeight: 600 },
  scrubber: { width: '100%', accentColor: '#7c3aed', cursor: 'pointer' },
  controls: { display: 'flex', alignItems: 'center', gap: 8 },
  controlBtn: {
    background: 'rgba(124,58,237,0.2)',
    border: '1px solid rgba(124,58,237,0.4)',
    borderRadius: 6,
    color: '#c4b5fd',
    padding: '4px 10px',
    fontSize: 14,
    cursor: 'pointer',
  },
  speedGroup: { display: 'flex', gap: 3, marginLeft: 'auto' },
  speedBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#64748b',
    padding: '2px 6px',
    fontSize: 10,
    cursor: 'pointer',
  },
  speedActive: {
    background: 'rgba(124,58,237,0.3)',
    borderColor: 'rgba(124,58,237,0.6)',
    color: '#c4b5fd',
  },
  deltas: { display: 'flex', flexDirection: 'column', gap: 2 },
  delta: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
  deltaNode: { color: '#94a3b8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deltaArrow: { color: '#475569' },
  deltaValue: { color: '#fbbf24', fontFamily: 'monospace' },
};
