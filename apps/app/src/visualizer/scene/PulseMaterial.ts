import * as pc from 'playcanvas';

function hexToColor(hex: string): pc.Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new pc.Color(r, g, b);
}

const PINK_HEX = '#EC4899';
const CYAN_HEX = '#06B6D4';

const EMISSIVE_CHUNK = /* glsl */ `
uniform float uTime;
uniform float uPulseActive;
uniform float pulseFreq;
uniform float pulseAmp;
uniform vec3 u_pulseColorA;
uniform vec3 u_pulseColorB;
uniform vec3 u_baseEmissive;
void getEmission() {
    if (uPulseActive > 0.5) {
        float t = 0.5 + 0.5 * sin(uTime * pulseFreq * 6.2831853);
        dEmission = mix(u_pulseColorA, u_pulseColorB, t) * pulseAmp;
    } else {
        dEmission = u_baseEmissive;
    }
}
`;

/**
 * Create a neon-pulse StandardMaterial.
 * Shader uniforms updated per frame via setParameter / tickTime.
 */
export function createPulseMaterial(
  _app: pc.Application,
  baseColor: pc.Color,
): pc.StandardMaterial {
  const pink = hexToColor(PINK_HEX);
  const cyan = hexToColor(CYAN_HEX);

  // Tint toward pink (mix 0.4)
  const colorA = new pc.Color(
    baseColor.r + (pink.r - baseColor.r) * 0.4,
    baseColor.g + (pink.g - baseColor.g) * 0.4,
    baseColor.b + (pink.b - baseColor.b) * 0.4,
  );

  // Tint toward cyan (mix 0.4)
  const colorB = new pc.Color(
    baseColor.r + (cyan.r - baseColor.r) * 0.4,
    baseColor.g + (cyan.g - baseColor.g) * 0.4,
    baseColor.b + (cyan.b - baseColor.b) * 0.4,
  );

  const baseEmissive = new pc.Vec3(baseColor.r * 0.1, baseColor.g * 0.1, baseColor.b * 0.1);

  const mat = new pc.StandardMaterial();
  mat.diffuse      = baseColor.clone();
  mat.metalness    = 0.2;
  mat.useMetalness = true;
  mat.gloss        = 0.5;

  // Override emissive chunk with pulse GLSL
  (mat.chunks as Record<string, string>).emissivePS = EMISSIVE_CHUNK;

  // Default uniform values
  mat.setParameter('pulseFreq',      2.0);
  mat.setParameter('pulseAmp',       2.0);
  mat.setParameter('u_pulseColorA',  [colorA.r, colorA.g, colorA.b]);
  mat.setParameter('u_pulseColorB',  [colorB.r, colorB.g, colorB.b]);
  mat.setParameter('u_baseEmissive', [baseEmissive.x, baseEmissive.y, baseEmissive.z]);
  mat.setParameter('uPulseActive',   0.0);
  mat.setParameter('uTime',          0.0);

  mat.update();
  return mat;
}

/**
 * Tick the shared uTime uniform on all pulse materials.
 * Call once per frame from SceneManager.
 */
export function tickTime(materials: pc.StandardMaterial[], t: number): void {
  for (const mat of materials) {
    mat.setParameter('uTime', t);
  }
}
