import * as pc from 'playcanvas';

const PNG_URL  = 'https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/fonts/arial.png';
const JSON_URL = 'https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/fonts/arial.json';

let cachedPromise: Promise<pc.Asset> | null = null;

/**
 * Load PlayCanvas's Arial MSDF font assets and return a font pc.Asset.
 * The promise is cached so repeat calls share the same load.
 */
export async function loadFont(app: pc.Application): Promise<pc.Asset> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = new Promise<pc.Asset>((resolve, reject) => {
    // Step 1: load the PNG texture
    app.assets.loadFromUrl(PNG_URL, 'texture', (err, texAsset) => {
      if (err || !texAsset) {
        reject(err ?? new Error('Failed to load MSDF texture'));
        return;
      }

      // Step 2: load the JSON font descriptor
      app.assets.loadFromUrl(JSON_URL, 'font', (err2, fontAsset) => {
        if (err2 || !fontAsset) {
          reject(err2 ?? new Error('Failed to load MSDF font JSON'));
          return;
        }

        // Patch the font resource so it uses the loaded MSDF texture
        if (fontAsset.resource && texAsset.resource) {
          (fontAsset.resource as { textures?: pc.Texture[] }).textures = [
            texAsset.resource as pc.Texture,
          ];
        }

        resolve(fontAsset);
      });
    });
  });

  return cachedPromise;
}
