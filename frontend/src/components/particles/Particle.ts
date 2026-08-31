// ==========================================
// Particle.ts — Individual Retro Arcade Particle
// ==========================================

import { PARTICLE_CONFIG } from './ParticleConfig'

export type ParticleShape = 'square' | 'diamond' | 'cross' | 'alien' | 'star'

export interface MouseState {
  x: number
  y: number
  isActive: boolean
  isHovering: boolean
  isClicking: boolean
}

export class Particle {
  x: number
  y: number
  size: number
  originalSize: number
  color: string
  baseColor: string
  vx: number
  vy: number
  shape: ParticleShape
  alpha: number
  currentAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  orbitRadius: number
  orbitAngle: number
  orbitSpeed: number
  isOrbiting: boolean
  orbitTimer: number
  explosionForce: number

  constructor(width: number, height: number) {
    this.x = Math.random() * width
    this.y = Math.random() * height
    this.size =
      PARTICLE_CONFIG.size.min +
      Math.random() * (PARTICLE_CONFIG.size.max - PARTICLE_CONFIG.size.min)
    this.originalSize = this.size
    this.baseColor =
      PARTICLE_CONFIG.colors[Math.floor(Math.random() * PARTICLE_CONFIG.colors.length)]
    this.color = this.baseColor

    const shapes: ParticleShape[] = ['square', 'diamond', 'cross', 'alien', 'star']
    this.shape = shapes[Math.floor(Math.random() * shapes.length)]

    const speed =
      PARTICLE_CONFIG.speed.min +
      Math.random() * (PARTICLE_CONFIG.speed.max - PARTICLE_CONFIG.speed.min)
    const angle = Math.random() * Math.PI * 2
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed

    this.alpha = 0.65 + Math.random() * 0.35
    this.currentAlpha = this.alpha
    this.twinkleSpeed = 0.02 + Math.random() * 0.04
    this.twinklePhase = Math.random() * Math.PI * 2

    this.orbitRadius =
      PARTICLE_CONFIG.orbitRadius.min +
      Math.random() * (PARTICLE_CONFIG.orbitRadius.max - PARTICLE_CONFIG.orbitRadius.min)
    this.orbitAngle = Math.random() * Math.PI * 2
    this.orbitSpeed = 0.015 + Math.random() * 0.02
    this.isOrbiting = false
    this.orbitTimer = 0
    this.explosionForce = 0
  }

  update(mouse: MouseState, width: number, height: number) {
    // 1. Twinkle effect
    this.twinklePhase += this.twinkleSpeed
    this.currentAlpha = this.alpha * (0.65 + 0.35 * Math.sin(this.twinklePhase))

    // 2. Mouse interactions
    if (mouse.isActive) {
      const dx = this.x - mouse.x
      const dy = this.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Repulsion (Menjauh dari kursor saat dekat)
      if (dist < PARTICLE_CONFIG.repulsionRadius && dist > 0) {
        const forceRatio = (PARTICLE_CONFIG.repulsionRadius - dist) / PARTICLE_CONFIG.repulsionRadius
        const pushForce = forceRatio * forceRatio * 1.8
        this.vx += (dx / dist) * pushForce
        this.vy += (dy / dist) * pushForce
        this.color = '#FFD700' // Highlight color saat terdorong
      } else if (dist < PARTICLE_CONFIG.attractionRadius) {
        // Attraction (Gravitasi ringan di orbit luar)
        const pullForce = 0.03
        this.vx -= (dx / dist) * pullForce
        this.vy -= (dy / dist) * pullForce
        this.color = this.baseColor
      } else {
        this.color = this.baseColor
      }

      // Orbit Mode (partikel dekat saat diam)
      if (this.isOrbiting) {
        this.orbitAngle += this.orbitSpeed
        const targetX = mouse.x + Math.cos(this.orbitAngle) * this.orbitRadius
        const targetY = mouse.y + Math.sin(this.orbitAngle) * this.orbitRadius
        this.x += (targetX - this.x) * 0.05
        this.y += (targetY - this.y) * 0.05

        this.orbitTimer++
        if (this.orbitTimer > 180) {
          // 3 seconds @ 60fps
          this.isOrbiting = false
          this.orbitTimer = 0
        }
      }
    } else {
      this.isOrbiting = false
      this.color = this.baseColor
    }

    // 3. Movement
    this.x += this.vx
    this.y += this.vy

    // 4. Velocity damping & friction
    this.vx *= PARTICLE_CONFIG.friction
    this.vy *= PARTICLE_CONFIG.friction

    // 5. Speed limit
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy)
    if (currentSpeed > PARTICLE_CONFIG.maxSpeed) {
      this.vx = (this.vx / currentSpeed) * PARTICLE_CONFIG.maxSpeed
      this.vy = (this.vy / currentSpeed) * PARTICLE_CONFIG.maxSpeed
    }

    // 6. Brownian motion (gentle wandering when slow)
    if (Math.abs(this.vx) < 0.08 && Math.abs(this.vy) < 0.08 && !this.isOrbiting) {
      this.vx += (Math.random() - 0.5) * 0.06
      this.vy += (Math.random() - 0.5) * 0.06
    }

    // 7. Boundary bounce with margin
    const margin = 10
    if (this.x < margin) {
      this.x = margin
      this.vx = Math.abs(this.vx) * 0.8
    } else if (this.x > width - margin) {
      this.x = width - margin
      this.vx = -Math.abs(this.vx) * 0.8
    }

    if (this.y < margin) {
      this.y = margin
      this.vy = Math.abs(this.vy) * 0.8
    } else if (this.y > height - margin) {
      this.y = height - margin
      this.vy = -Math.abs(this.vy) * 0.8
    }

    // 8. Explosion damping
    if (this.explosionForce > 0) {
      this.size += (this.originalSize - this.size) * 0.04
      this.explosionForce *= 0.94
      if (this.explosionForce < 0.1) {
        this.explosionForce = 0
        this.size = this.originalSize
      }
    }
  }

  explode(originX: number, originY: number, force: number = PARTICLE_CONFIG.explosionForce) {
    const dx = this.x - originX
    const dy = this.y - originY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < PARTICLE_CONFIG.explosionRadius && dist > 0) {
      const effectFactor = 1 - dist / PARTICLE_CONFIG.explosionRadius
      const totalForce = force * effectFactor * 1.5

      this.vx += (dx / dist) * totalForce
      this.vy += (dy / dist) * totalForce
      this.explosionForce = totalForce
      this.size = this.originalSize * 1.6
      this.color = '#FFFFFF'
    }
  }

  setOrbit(enabled: boolean, angleOffset: number = 0) {
    this.isOrbiting = enabled
    this.orbitTimer = 0
    if (enabled) {
      this.orbitAngle = angleOffset
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalAlpha = Math.max(0.1, Math.min(1, this.currentAlpha))
    ctx.translate(this.x, this.y)

    const s = Math.max(1.5, Math.round(this.size))
    ctx.fillStyle = this.color

    // Neon glow for large particles or exploding particles
    if (s >= 5 || this.explosionForce > 0) {
      ctx.shadowColor = this.color
      ctx.shadowBlur = 8
    }

    // 5 Retro Arcade Pixel Shapes
    switch (this.shape) {
      case 'square':
        ctx.fillRect(-s / 2, -s / 2, s, s)
        break

      case 'diamond':
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(s * 0.8, 0)
        ctx.lineTo(0, s)
        ctx.lineTo(-s * 0.8, 0)
        ctx.closePath()
        ctx.fill()
        break

      case 'cross': {
        const seg = Math.max(1, s / 3)
        ctx.fillRect(-seg / 2, -s, seg, s * 2)
        ctx.fillRect(-s, -seg / 2, s * 2, seg)
        break
      }

      case 'alien': {
        // Space Invaders / Retro 8-bit Alien
        const unit = Math.max(1, s / 4)
        // Horns / antennae
        ctx.fillRect(-unit * 1.5, -unit * 1.5, unit, unit)
        ctx.fillRect(unit * 0.5, -unit * 1.5, unit, unit)
        // Body core
        ctx.fillRect(-unit * 2, -unit * 0.5, unit * 4, unit)
        // Feet
        ctx.fillRect(-unit * 1.5, unit * 0.5, unit, unit)
        ctx.fillRect(unit * 0.5, unit * 0.5, unit, unit)
        break
      }

      case 'star': {
        // 4-pointed 8-bit star
        const half = s * 0.5
        const quarter = Math.max(1, s * 0.25)
        ctx.fillRect(-quarter, -s, quarter * 2, s * 2)
        ctx.fillRect(-s, -quarter, s * 2, quarter * 2)
        ctx.fillRect(-half, -half, half * 2, half * 2)
        break
      }
    }

    ctx.restore()
  }
}
