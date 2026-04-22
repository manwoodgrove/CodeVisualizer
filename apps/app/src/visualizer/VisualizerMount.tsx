import { useEffect, useRef } from 'react';
import { createApp, destroyApp } from './engine/app.js';
import { setupCamera } from './engine/camera.js';
import { setupLighting } from './engine/lighting.js';
import { SceneManager } from './scene/SceneManager.js';

export function VisualizerMount() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = createApp(canvas);
    setupLighting(app);
    const cameraState = setupCamera(app);
    const sceneManager = new SceneManager(app, cameraState);

    return () => {
      sceneManager.destroy();
      destroyApp();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
