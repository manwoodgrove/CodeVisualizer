import { useEffect, useState } from 'react'
import { SceneContext } from './ui/Viewport.js'
import { Viewport } from './ui/Viewport.js'
import { TopBar } from './ui/TopBar.js'
import { ImportPanel } from './ui/ImportPanel.js'
import { GraphControls } from './ui/GraphControls.js'
import { NodeInspector } from './ui/NodeInspector.js'
import { SignalLauncher } from './ui/SignalLauncher.js'
import { LegendOverlay } from './ui/LegendOverlay.js'
import { LoginGate } from './ui/LoginGate.js'
import { useAuthStore } from './store/authStore.js'
import { useRepoStore } from './store/repoStore.js'
import { api } from './api/client.js'
import type { SceneManager } from './visualizer/index.js'

export function App() {
  const { refresh, user, loading } = useAuthStore()
  const { setRepos } = useRepoStore()
  const [scene, setScene] = useState<SceneManager | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    refresh().finally(() => setBootstrapped(true))
  }, [])

  useEffect(() => {
    if (!user) return
    api.listRepos().then(({ repos }) => setRepos(repos)).catch(() => {})
  }, [user])

  function handleSceneReady(sceneManager: SceneManager) {
    setScene(sceneManager)
  }

  if (!bootstrapped || !user) {
    return <LoginGate loading={loading || !bootstrapped} />
  }

  return (
    <SceneContext.Provider value={scene}>
      <div className="app-grid">
        <TopBar />

        <aside className="app-sidebar">
          <ImportPanel />
          <GraphControls />
        </aside>

        <main className="app-viewport">
          <Viewport onSceneReady={handleSceneReady} />
          <LegendOverlay />
        </main>

        <aside className="app-inspector">
          <NodeInspector />
          <SignalLauncher />
        </aside>
      </div>
    </SceneContext.Provider>
  )
}
