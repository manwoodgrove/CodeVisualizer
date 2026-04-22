import * as pc from 'playcanvas';

let cachedAsset: pc.Asset | null = null;

/**
 * Create a CanvasFont from system Arial and return it wrapped in a pc.Asset.
 * The result is cached — calling this multiple times returns the same asset.
 */
export async function loadFont(app: pc.Application): Promise<pc.Asset> {
  if (cachedAsset) return cachedAsset;

  const canvasFont = new pc.CanvasFont(app, {
    fontName: 'Arial',
    fontSize: 32,
    color: new pc.Color(1, 1, 1),
    width: 512,
    height: 512,
  });

  // Render glyphs for all characters we expect to display
  canvasFont.createTextures(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _.:()<>-/',
  );

  const fontAsset = new pc.Asset('cv-font', 'font', undefined);
  // Assign the CanvasFont as the resource so ElementComponent can use it
  (fontAsset as unknown as Record<string, unknown>).resource = canvasFont;
  fontAsset.loaded = true;
  app.assets.add(fontAsset);

  cachedAsset = fontAsset;
  return fontAsset;
}
