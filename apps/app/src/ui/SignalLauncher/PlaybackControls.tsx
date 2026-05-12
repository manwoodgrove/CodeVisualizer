import { useContext } from 'react'
import { SceneContext } from '../../ui/Viewport.js'
import { useSignalStore } from '../../store/signalStore.js'

export function PlaybackControls() {
  const scene = useContext(SceneContext)
  const { simulation, playback, setPlaybackState, setFrameIdx } = useSignalStore()

  const frameCount = simulation?.frames.length ?? 0

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

  if (!simulation || frameCount === 0) return null

  return (
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
  )
}
