import * as pc from 'playcanvas';

export class LightingRig {
  private keyLight: pc.Entity;
  private fillLight: pc.Entity;

  constructor(app: pc.Application, parent: pc.Entity) {
    // Ambient
    app.scene.ambientLight = new pc.Color(0.15, 0.17, 0.25);

    // Key directional light — white, intensity 1
    this.keyLight = new pc.Entity('KeyLight');
    this.keyLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 1, 1),
      intensity: 1.0,
      castShadows: false,
    });
    this.keyLight.setEulerAngles(-45, 45, 0);
    parent.addChild(this.keyLight);

    // Fill directional light — cool tint, intensity 0.4
    this.fillLight = new pc.Entity('FillLight');
    this.fillLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.6, 0.7, 1.0),
      intensity: 0.4,
      castShadows: false,
    });
    this.fillLight.setEulerAngles(45, -120, 0);
    parent.addChild(this.fillLight);
  }

  destroy(): void {
    this.keyLight.destroy();
    this.fillLight.destroy();
  }
}
