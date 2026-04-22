import * as pc from 'playcanvas';

let _app: pc.Application | null = null;

export function createApp(canvas: HTMLCanvasElement): pc.Application {
  if (_app) {
    _app.destroy();
    _app = null;
  }

  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    keyboard: new pc.Keyboard(window),
    graphicsDeviceOptions: { antialias: true, alpha: false },
  });

  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  window.addEventListener('resize', () => app.resizeCanvas());

  app.start();
  _app = app;
  return app;
}

export function getApp(): pc.Application {
  if (!_app) throw new Error('PlayCanvas app not initialized');
  return _app;
}

export function destroyApp(): void {
  if (_app) {
    _app.destroy();
    _app = null;
  }
}
