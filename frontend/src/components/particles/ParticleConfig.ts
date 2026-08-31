// ==========================================
// ParticleConfig.ts — Retro Arcade Particles Configuration
// ==========================================

export const PARTICLE_CONFIG = {
  // Particle count
  count: 150,

  // Particle size range in pixels
  size: { min: 3, max: 9 },

  // Movement speed
  speed: { min: 0.25, max: 1.1 },

  // Vibrant arcade color palette (matching PixelBooth retro theme)
  colors: [
    '#FF5A36', // PixelBooth Neon Orange
    '#FFD700', // Arcade Gold / Yellow
    '#FFFFFF', // Crisp White
    '#FF8836', // Bright Amber
    '#FF8C9E', // Retro Neon Pink
    '#00FFAA', // Neon Mint Green
    '#00FFCC', // Neon Cyan
  ],

  // Interactive radii
  repulsionRadius: 160,
  attractionRadius: 320,
  connectionDistance: 105,
  orbitRadius: { min: 40, max: 95 },

  // Explosion physics
  explosionForce: 15,
  explosionRadius: 320,

  // Speed and friction limits
  maxSpeed: 5.0,
  friction: 0.988,

  // Connecting lines
  connectionAlpha: 0.25,
  lineColor: '#FF5A36',

  // Target FPS
  targetFPS: 60,
} as const

/** Hitung jumlah partikel yang pas berdasarkan resolusi perangkat (iPad vs Handphone vs Desktop) */
export function getAdaptiveParticleCount(width: number): number {
  if (width < 640) return 30  // Handphone: frekuensi sangat ringan & bersih
  if (width < 1024) return 60 // iPad / Tablet: frekuensi sedang & proporsional
  return 145                  // Desktop / Laptop: frekuensi penuh
}

