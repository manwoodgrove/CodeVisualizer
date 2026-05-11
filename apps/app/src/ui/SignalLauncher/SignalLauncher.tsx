import { PlaybackControls } from './PlaybackControls.js'
import { SpeedControls } from './SpeedControls.js'
import { ConfigControls } from './ConfigControls.js'

export function SignalLauncher() {
  return (
    <div className="panel panel--right">
      <div className="panel-title">Signal Launcher</div>

      <div className="flex-col">
        <ConfigControls />
        <SpeedControls />
      </div>

      <PlaybackControls />
    </div>
  )
}
