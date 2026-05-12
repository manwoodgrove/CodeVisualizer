import { useContext, useState } from 'react'
import { SceneContext } from '../../ui/Viewport.js'
import { useGraph } from '../../store/graphStore.js'
import { useRepoStore } from '../../store/repoStore.js'
import { useSignalStore } from '../../store/signalStore.js'
import { api } from '../../api/client.js'

export function ConfigControls() {
  const scene = useContext(SceneContext)
  const selectedNodeId = useGraph((s) => s.selectedNodeId)
  const activeRepoId = useRepoStore((s) => s.activeRepoId)
  const { playback, setSimulation } = useSignalStore()

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

  return (
    <>
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

      <button
        className="btn--primary"
        onClick={handleLaunch}
        disabled={!canLaunch || busy}
      >
        {busy ? 'Simulating...' : 'Simulate from Selected'}
      </button>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
    </>
  )
}
