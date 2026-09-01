import React, { useEffect, useRef, useState } from 'react'
import { PARTICLE_CONFIG, getAdaptiveParticleCount } from './ParticleConfig'
import { Particle } from './Particle'
import type { MouseState } from './Particle'
import './styles/particles.css'

export const RetroParticles: React.FC = () => {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationFrameRef = useRef<number | null>(null)

  const mouseStateRef = useRef<MouseState>({
    x: -1000,
    y: -1000,
    isActive: false,
    isHovering: false,
    isClicking: false,
  })

  const [showScanlines, setShowScanlines] = useState<boolean>(true)
  const isPausedRef = useRef<boolean>(false)
  const lastHoverTimeRef = useRef<number>(0)
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current
    if (!bgCanvas) return

    const bgCtx = bgCanvas.getContext('2d', { alpha: true })
    if (!bgCtx) return

    // 1. Fullscreen resize handler
    let width = (bgCanvas.width = window.innerWidth)
    let height = (bgCanvas.height = window.innerHeight)

    const initParticles = (w: number, h: number) => {
      const targetCount = getAdaptiveParticleCount(w)
      particlesRef.current = Array.from(
        { length: targetCount },
        () => new Particle(w, h)
      )
    }

    // Initialize Particles Pool dengan kuota adaptif (Handphone: ~30, iPad: ~60, Desktop: ~145)
    initParticles(width, height)

    const handleResize = () => {
      const prevWidth = width
      width = bgCanvas.width = window.innerWidth
      height = bgCanvas.height = window.innerHeight

      if (getAdaptiveParticleCount(prevWidth) !== getAdaptiveParticleCount(width)) {
        initParticles(width, height)
      }
    }
    window.addEventListener('resize', handleResize)

    // 3. Mouse Event Listeners for background particle interaction
    const handleMouseMove = (e: MouseEvent) => {
      const mouse = mouseStateRef.current
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.isActive = true

      const dx = Math.abs(e.clientX - lastMousePosRef.current.x)
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y)
      if (dx > 3 || dy > 3) {
        lastHoverTimeRef.current = Date.now()
        lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const mouse = mouseStateRef.current
      mouse.isClicking = true

      particlesRef.current.forEach((p) => {
        p.explode(e.clientX, e.clientY, PARTICLE_CONFIG.explosionForce)
      })
    }

    const handleMouseUp = () => {
      const mouse = mouseStateRef.current
      mouse.isClicking = false
    }

    const handleMouseEnter = () => {
      mouseStateRef.current.isActive = true
    }

    const handleMouseLeave = () => {
      mouseStateRef.current.isActive = false
    }

    // 4. Touch Interactions (Mobile)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const touch = e.touches[0]
      mouseStateRef.current.x = touch.clientX
      mouseStateRef.current.y = touch.clientY
      mouseStateRef.current.isActive = true
      mouseStateRef.current.isClicking = true

      particlesRef.current.forEach((p) => {
        p.explode(touch.clientX, touch.clientY, PARTICLE_CONFIG.explosionForce * 1.2)
      })
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const touch = e.touches[0]
      mouseStateRef.current.x = touch.clientX
      mouseStateRef.current.y = touch.clientY
      mouseStateRef.current.isActive = true
    }

    const handleTouchEnd = () => {
      mouseStateRef.current.isActive = false
      mouseStateRef.current.isClicking = false
    }

    // 5. Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return

      switch (e.key.toLowerCase()) {
        case 'p':
          isPausedRef.current = !isPausedRef.current
          break
        case 'r':
          particlesRef.current.forEach((p) => {
            p.x = Math.random() * width
            p.y = Math.random() * height
            p.vx = (Math.random() - 0.5) * 2
            p.vy = (Math.random() - 0.5) * 2
          })
          break
        case 'e':
          particlesRef.current.forEach((p) => {
            p.explode(width / 2, height / 2, 20)
          })
          break
        case 'o':
          particlesRef.current.forEach((p, idx) => {
            p.setOrbit(!p.isOrbiting, (idx / PARTICLE_CONFIG.count) * Math.PI * 2)
          })
          break
        case 'h':
          setShowScanlines((prev) => !prev)
          break
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mousedown', handleMouseDown, { passive: true })
    window.addEventListener('mouseup', handleMouseUp, { passive: true })
    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('keydown', handleKeyDown)

    // 6. Connecting lines helper
    const drawConnectingLines = (ctx: CanvasRenderingContext2D) => {
      const particles = particlesRef.current
      const len = particles.length
      const maxDist = width < 640 ? 50 : width < 1024 ? 75 : PARTICLE_CONFIG.connectionDistance

      ctx.save()
      ctx.lineWidth = 1
      ctx.strokeStyle = PARTICLE_CONFIG.lineColor

      for (let i = 0; i < len; i++) {
        const p1 = particles[i]
        for (let j = i + 1; j < len; j++) {
          const p2 = particles[j]
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * PARTICLE_CONFIG.connectionAlpha
            ctx.globalAlpha = alpha
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    }

    // 7. 60FPS Render Loop
    let lastTime = performance.now()
    const targetInterval = 1000 / PARTICLE_CONFIG.targetFPS

    const render = (currentTime: number) => {
      const delta = currentTime - lastTime

      if (delta >= targetInterval) {
        lastTime = currentTime - (delta % targetInterval)

        bgCtx.clearRect(0, 0, width, height)
        const mouse = mouseStateRef.current

        if (
          mouse.isActive &&
          Date.now() - lastHoverTimeRef.current > 2000 &&
          lastHoverTimeRef.current > 0
        ) {
          particlesRef.current.forEach((p, idx) => {
            const dist = Math.sqrt(
              (p.x - mouse.x) ** 2 + (p.y - mouse.y) ** 2
            )
            if (dist < 220 && !p.isOrbiting) {
              p.setOrbit(true, (idx / 10) * Math.PI * 2)
            }
          })
        }

        drawConnectingLines(bgCtx)

        if (!isPausedRef.current) {
          particlesRef.current.forEach((p) => {
            p.update(mouse, width, height)
            p.draw(bgCtx)
          })
        } else {
          particlesRef.current.forEach((p) => p.draw(bgCtx))
        }
      }

      animationFrameRef.current = requestAnimationFrame(render)
    }

    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mouseenter', handleMouseEnter)
      document.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <canvas
        id="particleBgCanvas"
        ref={bgCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {showScanlines && (
        <div
          className="retro-crt-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

export default RetroParticles
