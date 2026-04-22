import * as pc from 'playcanvas';

export function setupLighting(app: pc.Application) {
  // Key light
  const key = new pc.Entity('KeyLight');
  key.addComponent('light', {
    type: pc.LIGHTTYPE_DIRECTIONAL,
    color: new pc.Color(1, 0.96, 0.9),
    intensity: 1.2,
    castShadows: false,
  });
  key.setEulerAngles(45, -30, 0);
  app.root.addChild(key);

  // Fill light
  const fill = new pc.Entity('FillLight');
  fill.addComponent('light', {
    type: pc.LIGHTTYPE_DIRECTIONAL,
    color: new pc.Color(0.4, 0.5, 0.8),
    intensity: 0.5,
    castShadows: false,
  });
  fill.setEulerAngles(-30, 120, 0);
  app.root.addChild(fill);

  // Ambient
  app.scene.ambientLight = new pc.Color(0.08, 0.08, 0.15);
}
