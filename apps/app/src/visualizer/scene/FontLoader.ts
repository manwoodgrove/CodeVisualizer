import * as pc from 'playcanvas';

const ARIAL_PNG =
  'https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/fonts/arial.png';
const ARIAL_JSON =
  'https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/fonts/arial.json';

/**
 * Loads the Arial MSDF font atlas and returns a pc.Asset ready for
 * assignment to pc.ElementComponent.font on label entities.
 *
 * Pattern extracted from manwoodgrove/playcanvas-font-factory- FontFactory.loadMSDF().
 */
export async function loadFont(app: pc.Application): Promise<pc.Asset> {
  return new Promise((resolve, reject) => {
    const texAsset = new pc.Asset('MSDFFontTexture', 'texture', { url: ARIAL_PNG });
    app.assets.add(texAsset);

    const fontAsset = new pc.Asset('MSDFFontData', 'font', { url: ARIAL_JSON });
    app.assets.add(fontAsset);

    let loaded = 0;
    let errored = false;

    const checkDone = () => {
      if (errored) return;
      loaded++;
      if (loaded === 2) {
        if (!fontAsset.resource || !texAsset.resource) {
          reject(new Error('MSDF font assets loaded but resources are null'));
          return;
        }
        // PlayCanvas MSDF fonts require the texture to be wired into the
        // parsed font resource manually before the element component will use it.
        (fontAsset.resource as any).textures = [texAsset.resource];
        resolve(fontAsset);
      }
    };

    const onError = (err: unknown) => {
      if (!errored) {
        errored = true;
        reject(err);
      }
    };

    texAsset.ready(checkDone);
    fontAsset.ready(checkDone);
    texAsset.on('error', onError);
    fontAsset.on('error', onError);

    app.assets.load(texAsset);
    app.assets.load(fontAsset);
  });
}
