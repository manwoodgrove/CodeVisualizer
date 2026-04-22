import * as pc from 'playcanvas';

export class LightingRig {
  private keyLight: pc.Entity;
  private fillLight: pc.Entity;
  private rimLight: pc.Entity;

  constructor(app: pc.Application, parent: pc.Entity) {
    // Deep indigo ambient so shadowed sides of nodes still pick up the
    // "night-sky over neon city" vibe of the reference art.
    app.scene.ambientLight = new pc.Color(0.05, 0.05, 0.12);

    // Key directional light — cool moonlit tone, low intensity (emissive does
    // most of the work).
    this.keyLight = new pc.Entity('KeyLight');
    this.keyLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.7, 0.85, 1.0),
      intensity: 0.55,
      castShadows: false,
    });
    this.keyLight.setEulerAngles(-55, 35, 0);
    parent.addChild(this.keyLight);

    // Fill directional light — warm magenta, adds a city-at-night bounce.
    this.fillLight = new pc.Entity('FillLight');
    this.fillLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.95, 0.35, 0.95),
      intensity: 0.35,
      castShadows: false,
    });
    this.fillLight.setEulerAngles(25, -135, 0);
    parent.addChild(this.fillLight);

    // Rim light from below, cyan — kisses the underside of nodes so they
    // read against the dark floor.
    this.rimLight = new pc.Entity('RimLight');
    this.rimLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.2, 0.85, 1.0),
      intensity: 0.25,
      castShadows: false,
    });
    this.rimLight.setEulerAngles(70, 180, 0);
    parent.addChild(this.rimLight);
  }

  destroy(): void {
    this.keyLight.destroy();
    this.fillLight.destroy();
    this.rimLight.destroy();
  }
}
