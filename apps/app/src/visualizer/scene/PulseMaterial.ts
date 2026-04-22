import * as pc from 'playcanvas';

// Neon-pulse emissive chunk. Blends smoothly between a resting emissive
// and an animated pink/cyan cycle via the per-instance uPulseActive uniform
// (0..1 — supports fractional fades, not just hard on/off).
const EMISSIVE_PS = /* glsl */ `
  #ifdef MAPCOLOR
  uniform vec3 material_emissive;
  #endif

  uniform float uTime;
  uniform float pulseFreq;
  uniform float pulseAmp;
  uniform vec3  u_pulseColorA;
  uniform vec3  u_pulseColorB;
  uniform float uPulseActive;

  void getEmission() {
      vec3 baseEmission = vec3(1.0);
      #ifdef MAPCOLOR
      baseEmission *= material_emissive;
      #endif

      float rawSine = sin(uTime * pulseFreq);
      float t = rawSine * 0.5 + 0.5;

      vec3 animatedColor = mix(u_pulseColorA, u_pulseColorB, t);
      vec3 emissionColor = mix(baseEmission, animatedColor, uPulseActive);

      float intensity = 0.2 + (t * pulseAmp * uPulseActive);
      dEmission = emissionColor * intensity;
  }
`;

/**
 * Creates a StandardMaterial with the neon-pulse emissive chunk overridden.
 *
 * Per-instance activation: meshInstance.setParameter('uPulseActive', 1.0 | 0.0)
 * (or any fractional value for a smooth fade).
 * Global time: tickTime([...materials], elapsed) once per frame.
 */
export function createPulseMaterial(
  _app: pc.Application,
  baseColor: pc.Color,
): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  mat.diffuse      = baseColor.clone();
  mat.emissive     = new pc.Color(baseColor.r * 0.1, baseColor.g * 0.1, baseColor.b * 0.1);
  mat.metalness    = 0.2;
  mat.useMetalness = true;
  mat.gloss        = 0.6;

  (mat.chunks as Record<string, string>).emissivePS = EMISSIVE_PS;

  // Warm-pink → electric-cyan pulse, hue-shifted from the base color
  const colorA = new Float32Array([
    Math.min(1, baseColor.r * 1.2 + 0.3),
    baseColor.g * 0.3,
    Math.min(1, baseColor.b * 0.5 + 0.3),
  ]);
  const colorB = new Float32Array([
    baseColor.r * 0.2,
    Math.min(1, baseColor.g * 0.8 + 0.2),
    1.0,
  ]);

  mat.setParameter('pulseFreq',     2.0);
  mat.setParameter('pulseAmp',      2.0);
  mat.setParameter('uTime',         0.0);
  mat.setParameter('uPulseActive',  0.0);
  mat.setParameter('u_pulseColorA', colorA);
  mat.setParameter('u_pulseColorB', colorB);
  mat.update();

  return mat;
}

/** Tick the shared uTime uniform. Call once per frame from SceneManager. */
export function tickTime(materials: pc.StandardMaterial[], t: number): void {
  for (const mat of materials) {
    mat.setParameter('uTime', t);
  }
}
