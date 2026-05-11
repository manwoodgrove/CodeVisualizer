import { useContext } from 'react'
import { SceneContext } from '../../ui/Viewport.js'
import { useSignalStore } from '../../store/signalStore.js'

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export function SpeedControls() {
  const scene = useContext(SceneContext)
  const { playback, setSpeed } = useSignalStore()

  return (
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
  )
}
