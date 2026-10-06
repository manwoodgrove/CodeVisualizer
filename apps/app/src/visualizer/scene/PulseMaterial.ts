import * as pc from 'playcanvas';

// Neon-pulse emissive chunk.
//
// At rest (uPulseActive = 0) the node breathes with a sine wave AND a
// fresnel rim glow, so even static nodes feel alive — the silhouette
// brightens as the camera orbits around them. When uPulseActive ramps
// to 1 during signal playback, the node lerps into an animated
// pink→cyan cycle with boosted intensity.
//
// uPulsePhase is set per-instance/material so a graph of N nodes
// breathes out-of-phase rather than strobing in unison.
const EMISSIVE_PS = /* glsl */ `
  #ifdef MAPCOLOR
  uniform vec3 material_emissive;
  #endif

  uniform float uTime;
  uniform float pulseFreq;
  uniform float pulseAmp;
  uniform float uPulsePhase;
  uniform vec3  u_pulseColorA;
  uniform vec3  u_pulseColorB;
  uniform float uPulseActive;
  uniform vec3  u_baseEmissive;

  void getEmission() {
      vec3 baseEmission = u_baseEmissive;

      float rawSine = sin(uTime * pulseFreq + uPulsePhase);
      float t = rawSine * 0.5 + 0.5;

      // Idle breathing — visible animation even on static graphs
      float idle = 0.65 + 0.55 * t;

      // Fresnel rim — silhouette brightens against the dark background.
      vec3 N = dVertexNormalW;
      vec3 V = dViewDirW;
      float ndotv = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = pow(1.0 - ndotv, 1.8);
      float rim = 0.45 + 1.40 * fresnel;

      vec3 pulseColor    = mix(u_pulseColorA, u_pulseColorB, t);
      vec3 emissionColor = mix(baseEmission * idle * rim, pulseColor * rim, uPulseActive);

      float intensity = 1.0 + (t * pulseAmp * uPulseActive);
      dEmission = emissionColor * intensity;
  }
`;

// Counter so each created material gets a different breathing phase.
let phaseSeed = 0;

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
  // Stronger rest emissive so even shadowed sides glow.
  mat.emissive     = new pc.Color(baseColor.r * 0.85, baseColor.g * 0.85, baseColor.b * 0.85);
  mat.metalness    = 0.20;
  mat.useMetalness = true;
  mat.gloss        = 0.85;

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

  // Initial base emissive triplet — kept as a uniform so highlight() can
  // boost it without recompiling shaders.
  const baseEmissive = new Float32Array([
    baseColor.r * 0.85,
    baseColor.g * 0.85,
    baseColor.b * 0.85,
  ]);

  // Slightly randomised breathing freq per-material for a more organic
  // "swarm" feel — same family of frequencies, different phases.
  const freqJitter = 1.85 + ((phaseSeed * 0.137) % 1) * 0.7;
  const phase      = (phaseSeed++ * 0.71) % (Math.PI * 2);

  mat.setParameter('pulseFreq',     freqJitter);
  mat.setParameter('pulseAmp',      2.6);
  mat.setParameter('uTime',         0.0);
  mat.setParameter('uPulseActive',  0.0);
  mat.setParameter('uPulsePhase',   phase);
  mat.setParameter('u_pulseColorA', colorA);
  mat.setParameter('u_pulseColorB', colorB);
  mat.setParameter('u_baseEmissive', baseEmissive);
  mat.update();

  return mat;
}

/** Tick the shared uTime uniform. Call once per frame from SceneManager. */
export function tickTime(materials: pc.StandardMaterial[], t: number): void {
  for (const mat of materials) {
    mat.setParameter('uTime', t);
  }
}
