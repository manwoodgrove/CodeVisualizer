import { createContext, useContext, useEffect, useRef } from 'react'
import { SceneManager } from '../visualizer/index.js'
import { useGraph } from '../store/graphStore.js'

export const SceneContext = createContext<SceneManager | null>(null)

export function useScene(): SceneManager | null {
  return useContext(SceneContext)
}

interface ViewportProps {
  onSceneReady: (scene: SceneManager) => void
}

export function Viewport({ onSceneReady }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<SceneManager | null>(null)
  const snapshot = useGraph((s) => s.snapshot)
  const selectedNodeId = useGraph((s) => s.selectedNodeId)
  const selectNode = useGraph((s) => s.selectNode)
  const visibleEdgeKinds = useGraph((s) => s.visibleEdgeKinds)

  useEffect(() => {
    const scene = new SceneManager(canvasRef.current!)
    sceneRef.current = scene
    scene.onPick((id: string | null) => selectNode(id))
    onSceneReady(scene)
    return () => scene.destroy()
  }, [])

  useEffect(() => {
    if (snapshot) sceneRef.current?.setSnapshot(snapshot)
  }, [snapshot])

  useEffect(() => {
    sceneRef.current?.highlightNode(selectedNodeId)
  }, [selectedNodeId])

  useEffect(() => {
    sceneRef.current?.setVisibleEdgeKinds(visibleEdgeKinds)
  }, [visibleEdgeKinds])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
