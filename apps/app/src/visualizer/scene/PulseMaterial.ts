import * as pc from 'playcanvas';

// Neon-pulse emissive chunk.
//
// At rest (uPulseActive = 0) the node breathes with a subtle sine, emitting
// the material's base colour. When uPulseActive ramps to 1 during signal
// playback, it lerps to an animated pink→cyan cycle with boosted intensity.
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

      // Idle breathing — always alive, very subtle
      float idle = 0.85 + 0.15 * t;

      vec3 pulseColor    = mix(u_pulseColorA, u_pulseColorB, t);
      vec3 emissionColor = mix(baseEmission * idle, pulseColor, uPulseActive);

      float intensity = 1.0 + (t * pulseAmp * uPulseActive);
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
  // Stronger rest emissive — the glow is doing the heavy lifting since we
  // dropped ambient light for the neon look.
  mat.emissive     = new pc.Color(baseColor.r * 0.65, baseColor.g * 0.65, baseColor.b * 0.65);
  mat.metalness    = 0.15;
  mat.useMetalness = true;
  mat.gloss        = 0.75;

  (mat.chunks as Record<string, string>).emissivePS = EMISSIVE_PS;

  // Pulse lerps between a warm pink and the base colour shifted toward cyan.
  // This keeps the active pulse colour readable across any base palette.
  const colorA = new Float32Array([
    Math.min(1, baseColor.r * 1.2 + 0.35),
    baseColor.g * 0.35,
    Math.min(1, baseColor.b * 0.55 + 0.35),
  ]);
  const colorB = new Float32Array([
    baseColor.r * 0.25,
    Math.min(1, baseColor.g * 0.9 + 0.25),
    1.0,
  ]);

  mat.setParameter('pulseFreq',     2.2);
  mat.setParameter('pulseAmp',      2.4);
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
