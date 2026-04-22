import { useContext, useState } from 'react'
import { SceneContext } from '../ui/Viewport.js'
import { useGraph } from '../store/graphStore.js'
import { useRepoStore } from '../store/repoStore.js'
import { useSignalStore } from '../store/signalStore.js'
import { api } from '../api/client.js'

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export function SignalLauncher() {
  const scene = useContext(SceneContext)
  const selectedNodeId = useGraph((s) => s.selectedNodeId)
  const activeRepoId = useRepoStore((s) => s.activeRepoId)
  const { simulation, playback, setSimulation, setPlaybackState, setFrameIdx, setSpeed } =
    useSignalStore()

  const [maxHops, setMaxHops] = useState(6)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canLaunch = Boolean(selectedNodeId && activeRepoId)

  async function handleLaunch() {
    if (!canLaunch || !selectedNodeId || !activeRepoId) return
    setError(null)
    setBusy(true)
    try {
      const { simulation: sim } = await api.simulate(activeRepoId, {
        seedNodeId: selectedNodeId,
        maxHops,
      })
      setSimulation(sim)
      scene?.playSimulation(sim, { speed: playback.speed })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setBusy(false)
    }
  }

  function handleScrub(idx: number) {
    setFrameIdx(idx)
    scene?.seekSimulation(idx)
  }

  function handlePlayPause() {
    if (playback.state === 'playing') {
      setPlaybackState('paused')
      scene?.pauseSimulation()
    } else {
      setPlaybackState('playing')
      scene?.resumeSimulation()
    }
  }

  const frameCount = simulation?.frames.length ?? 0

  return (
    <div className="panel panel--right">
      <div className="panel-title">Signal Launcher</div>

      <div className="flex-col">
        <div className="flex-row">
          <label className="metric-label" style={{ flexShrink: 0 }}>Max Hops</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </div>

        <div className="flex-row">
          <label className="metric-label" style={{ flexShrink: 0 }}>Speed</label>
          <div className="flex-row" style={{ flexWrap: 'wrap' }}>
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                style={{ padding: '3px 8px', fontSize: 11 }}
                className={playback.speed === s ? 'btn--primary' : ''}
                onClick={() => {
                  setSpeed(s)
                  scene?.setSpeed(s)
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn--primary"
          onClick={handleLaunch}
          disabled={!canLaunch || busy}
        >
          {busy ? 'Simulating...' : 'Simulate from Selected'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {simulation && frameCount > 0 && (
        <div className="flex-col mt-12">
          <div className="flex-row" style={{ justifyContent: 'space-between' }}>
            <button onClick={handlePlayPause} style={{ width: 72 }}>
              {playback.state === 'playing' ? 'Pause' : 'Play'}
            </button>
            <span className="metric-label">
              {playback.frameIdx + 1} / {frameCount}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={frameCount - 1}
            value={playback.frameIdx}
            onChange={(e) => handleScrub(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}
