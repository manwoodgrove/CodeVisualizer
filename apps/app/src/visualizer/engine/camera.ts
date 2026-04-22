import * as pc from 'playcanvas';

export interface OrbitCameraState {
  entity: pc.Entity;
  pivot: pc.Vec3;
  distance: number;
  yaw: number;
  pitch: number;
}

export function setupCamera(app: pc.Application): OrbitCameraState {
  const camera = new pc.Entity('Camera');
  camera.addComponent('camera', {
    fov: 60,
    nearClip: 0.5,
    farClip: 10000,
    clearColor: new pc.Color(0.04, 0.04, 0.08, 1),
  });

  app.root.addChild(camera);
  camera.setPosition(0, 0, 300);
  camera.lookAt(pc.Vec3.ZERO);

  const state: OrbitCameraState = {
    entity: camera,
    pivot: new pc.Vec3(0, 0, 0),
    distance: 300,
    yaw: 0,
    pitch: 20,
  };

  setupOrbitControls(app, state);
  return state;
}

function setupOrbitControls(app: pc.Application, state: OrbitCameraState) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const canvas = app.graphicsDevice.canvas;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 || e.button === 2) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  window.addEventListener('mouseup', () => { dragging = false; });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (e.buttons === 1) {
      // Orbit
      state.yaw -= dx * 0.3;
      state.pitch = Math.max(-85, Math.min(85, state.pitch - dy * 0.3));
    } else if (e.buttons === 4 || e.buttons === 2) {
      // Pan
      const right = new pc.Vec3();
      const up = new pc.Vec3();
      state.entity.getWorldTransform().getX(right);
      state.entity.getWorldTransform().getY(up);
      const panSpeed = state.distance * 0.001;
      state.pivot.add(right.mulScalar(-dx * panSpeed));
      state.pivot.add(up.mulScalar(dy * panSpeed));
    }
    updateCameraPosition(state);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.distance = Math.max(10, state.distance * (1 + e.deltaY * 0.001));
    updateCameraPosition(state);
  }, { passive: false });
}

export function updateCameraPosition(state: OrbitCameraState) {
  const yawRad = state.yaw * pc.math.DEG_TO_RAD;
  const pitchRad = state.pitch * pc.math.DEG_TO_RAD;

  const x = state.pivot.x + state.distance * Math.sin(yawRad) * Math.cos(pitchRad);
  const y = state.pivot.y + state.distance * Math.sin(pitchRad);
  const z = state.pivot.z + state.distance * Math.cos(yawRad) * Math.cos(pitchRad);

  state.entity.setPosition(x, y, z);
  state.entity.lookAt(state.pivot);
}

export function flyToPosition(
  state: OrbitCameraState,
  target: pc.Vec3,
  distance = 150,
  duration = 800,
) {
  const startPivot = state.pivot.clone();
  const startDist = state.distance;
  const start = performance.now();

  function animate() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    state.pivot.lerp(startPivot, target, ease);
    state.distance = startDist + (distance - startDist) * ease;
    updateCameraPosition(state);

    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
