import * as pc from 'playcanvas';

/**
 * Neon grid floor. Two stacked planes:
 *   - a faint flat "space-dust" plane for atmosphere
 *   - the emissive grid itself, drawn additively so lines glow
 *
 * The grid is procedural — a small RGBA texture with a single cross of
 * bright pixels, tiled N×N across the plane. A second, larger cross is
 * packed into the same texture for accent lines every 10 cells.
 */
export class GroundPlane {
  private entity: pc.Entity;
  private haloEntity: pc.Entity;
  private gridMaterial: pc.StandardMaterial;
  private time = 0;

  constructor(app: pc.Application, parent: pc.Entity) {
    const device = app.graphicsDevice;

    const gridTex = createGridTexture(device);

    this.gridMaterial = new pc.StandardMaterial();
    this.gridMaterial.emissiveMap     = gridTex;
    this.gridMaterial.emissive        = new pc.Color(0.25, 0.65, 1.0);
    this.gridMaterial.emissiveMapTiling = new pc.Vec2(60, 60);
    this.gridMaterial.diffuse         = new pc.Color(0, 0, 0);
    this.gridMaterial.opacityMap      = gridTex;
    this.gridMaterial.opacityMapChannel = 'a';
    this.gridMaterial.blendType       = pc.BLEND_ADDITIVEALPHA;
    this.gridMaterial.depthWrite      = false;
    this.gridMaterial.useLighting     = false;
    this.gridMaterial.cull            = pc.CULLFACE_NONE;
    this.gridMaterial.update();

    const gridMesh = pc.createPlane(device, {
      halfExtents: new pc.Vec2(1200, 1200),
    });

    this.entity = new pc.Entity('GroundPlane');
    this.entity.addComponent('render', {
      meshInstances: [new pc.MeshInstance(gridMesh, this.gridMaterial)],
      castShadows: false,
      receiveShadows: false,
    });
    this.entity.setLocalPosition(0, -1.5, 0);
    parent.addChild(this.entity);

    // Soft radial halo — a second plane with a radial falloff texture that
    // bathes the centre of the grid in a subtle blue / magenta wash.
    const haloTex = createHaloTexture(device);
    const haloMat = new pc.StandardMaterial();
    haloMat.emissiveMap     = haloTex;
    haloMat.emissive        = new pc.Color(0.4, 0.2, 0.9);
    haloMat.diffuse         = new pc.Color(0, 0, 0);
    haloMat.opacityMap      = haloTex;
    haloMat.opacityMapChannel = 'a';
    haloMat.blendType       = pc.BLEND_ADDITIVEALPHA;
    haloMat.depthWrite      = false;
    haloMat.useLighting     = false;
    haloMat.cull            = pc.CULLFACE_NONE;
    haloMat.update();

    const haloMesh = pc.createPlane(device, {
      halfExtents: new pc.Vec2(1600, 1600),
    });

    this.haloEntity = new pc.Entity('GroundHalo');
    this.haloEntity.addComponent('render', {
      meshInstances: [new pc.MeshInstance(haloMesh, haloMat)],
      castShadows: false,
      receiveShadows: false,
    });
    this.haloEntity.setLocalPosition(0, -1.6, 0);
    parent.addChild(this.haloEntity);
  }

  update(dt: number): void {
    this.time += dt;
    // Slowly drift grid offset for a subtle "energy field" shimmer
    const offset = new pc.Vec2(
      (this.time * 0.01) % 1,
      (this.time * 0.007) % 1,
    );
    this.gridMaterial.emissiveMapOffset = offset;
    // Emissive intensity oscillates gently so the grid feels alive
    const glow = 0.5 + 0.15 * Math.sin(this.time * 0.8);
    this.gridMaterial.emissive = new pc.Color(
      0.25 * glow * 2,
      0.65 * glow * 2,
      1.0 * glow * 2,
    );
    this.gridMaterial.update();
  }

  destroy(): void {
    this.entity.destroy();
    this.haloEntity.destroy();
  }
}

function createGridTexture(device: pc.GraphicsDevice): pc.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  // Transparent background; bright line on left + top edge of each tile.
  // When tiled this produces a full grid of thin glowing lines.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const onLine  = x === 0 || y === 0;
      const onThick = x < 1 && y < 1;
      if (onThick) {
        data[idx + 0] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      } else if (onLine) {
        data[idx + 0] = 200;
        data[idx + 1] = 230;
        data[idx + 2] = 255;
        data[idx + 3] = 180;
      } else {
        data[idx + 3] = 0;
      }
    }
  }
  const tex = new pc.Texture(device, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    mipmaps: true,
  });
  const pixels = tex.lock() as Uint8Array;
  pixels.set(data);
  tex.unlock();
  return tex;
}

function createHaloTexture(device: pc.GraphicsDevice): pc.Texture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r  = Math.sqrt(dx * dx + dy * dy);
      const a  = Math.max(0, 1 - r);
      const falloff = a * a * a;
      const idx = (y * size + x) * 4;
      data[idx + 0] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(falloff * 180);
    }
  }
  const tex = new pc.Texture(device, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
  });
  const pixels = tex.lock() as Uint8Array;
  pixels.set(data);
  tex.unlock();
  return tex;
}
