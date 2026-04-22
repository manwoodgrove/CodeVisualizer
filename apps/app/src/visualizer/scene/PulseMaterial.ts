import * as pc from 'playcanvas';

// GLSL chunk extracted verbatim from manwoodgrove/neon-pulse-shader SignalGraph.tsx.
// Overrides StandardMaterial emissivePS to drive a per-instance sine-wave pulse.
const EMISSIVE_PS = /* glsl */ `
  #ifdef MAPCOLOR
  uniform vec3 material_emissive;
  #endif

  // Global elapsed time advanced by app.on('update')
  uniform float uTime;

  // Wave shape
  uniform float pulseFreq;
  uniform float pulseAmp;

  // Color transition endpoints
  uniform vec3 u_pulseColorA;
  uniform vec3 u_pulseColorB;

  // Per-MeshInstance active flag (1.0 = pulsing, 0.0 = resting)
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
 * Creates a pc.StandardMaterial with the neon-pulse emissive chunk.
 * Pulse colors are derived from baseColor:
 *   colorA = warm-pink tint  (active start)
 *   colorB = electric-cyan   (active peak)
 *
 * Per-instance activation: call meshInstance.setParameter('uPulseActive', 1.0|0.0).
 * Global time: call material.setParameter('uTime', elapsed) each frame.
 */
export function createPulseMaterial(baseColor: pc.Color): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  mat.diffuse = baseColor.clone();
  mat.metalness = 0.2;
  mat.gloss = 0.6;

  // Chunk override — requires PlayCanvas StandardMaterial chunk system
  (mat.chunks as Record<string, string>).emissivePS = EMISSIVE_PS;

  // Warm-pink → electric-cyan pulse colors derived from base hue
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

  mat.setParameter('pulseFreq', 2.0);
  mat.setParameter('pulseAmp', 2.0);
  mat.setParameter('uTime', 0.0);
  mat.setParameter('uPulseActive', 0.0);
  mat.setParameter('u_pulseColorA', colorA);
  mat.setParameter('u_pulseColorB', colorB);
  mat.update();

  return mat;
}
