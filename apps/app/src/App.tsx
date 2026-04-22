import { useEffect } from 'react';
import { VisualizerMount } from './visualizer/VisualizerMount.js';
import { ImportPanel } from './ui/panels/ImportPanel.js';
import { NodeInspector } from './ui/panels/NodeInspector.js';
import { SignalLauncher } from './ui/panels/SignalLauncher.js';
import { GraphControls } from './ui/panels/GraphControls.js';
import { LegendOverlay } from './ui/components/LegendOverlay.js';
import { useRepoStore } from './store/repo-store.js';
import { socketService } from './api/socket.js';

export default function App() {
  const { activeRepoId } = useRepoStore();

  useEffect(() => {
    socketService.connect();
    return () => socketService.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* PlayCanvas canvas fills the background */}
      <VisualizerMount />

      {/* UI overlays */}
      <div style={styles.topBar}>
        <span style={styles.logo}>⬡ CodeVisualizer</span>
        <GraphControls />
      </div>

      <ImportPanel />
      {activeRepoId && <NodeInspector />}
      {activeRepoId && <SignalLauncher />}
      <LegendOverlay />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 16,
    background: 'rgba(10,10,20,0.85)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    zIndex: 100,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#60a5fa',
    userSelect: 'none',
  },
};
