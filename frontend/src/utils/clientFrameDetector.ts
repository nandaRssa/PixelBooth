import type { CameraFrame } from '@/types'
import { normalizeFrame } from './frameMask'

/**
 * Client-Side Frame Detection Algorithm (HTML5 Canvas).
 * Ported with exact same logic as TemplateFrameDetector (Transparency + Smart Clear).
 */
export function detectFramesFromImage(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
): { frames: CameraFrame[]; method: 'transparent' | 'smart_clear' } {
  const w = img.naturalWidth || img.width || canvasW
  const h = img.naturalHeight || img.height || canvasH

  const maxDim = 400
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const workW = Math.max(1, Math.round(w * scale))
  const workH = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = workW
  canvas.height = workH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return { frames: [], method: 'smart_clear' }
  }

  ctx.drawImage(img, 0, 0, workW, workH)
  const imgData = ctx.getImageData(0, 0, workW, workH)
  const data = imgData.data

  const totalPixels = workW * workH
  const visited = new Uint8Array(totalPixels)

  // 1. CEK DETEKSI TRANSPARANSI (Alpha < 60)
  const transparentRegions: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number; borderTouches: number }> = []

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const idx = y * workW + x
      if (visited[idx]) continue

      const alpha = data[idx * 4 + 3]
      if (alpha < 60) {
        let minX = x, maxX = x, minY = y, maxY = y, count = 0
        const queue = [idx]
        visited[idx] = 1

        while (queue.length > 0) {
          const cur = queue.pop()!
          const cx = cur % workW
          const cy = Math.floor(cur / workW)
          count++

          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy

          const neighbors = [
            cy > 0 ? cur - workW : -1,
            cy < workH - 1 ? cur + workW : -1,
            cx > 0 ? cur - 1 : -1,
            cx < workW - 1 ? cur + 1 : -1,
          ]

          for (const n of neighbors) {
            if (n >= 0 && !visited[n]) {
              const a = data[n * 4 + 3]
              if (a < 60) {
                visited[n] = 1
                queue.push(n)
              }
            }
          }
        }

        const areaRatio = count / totalPixels
        const regionW = maxX - minX + 1
        const regionH = maxY - minY + 1
        const touchesLeft = minX <= 1 ? 1 : 0
        const touchesRight = maxX >= workW - 2 ? 1 : 0
        const touchesTop = minY <= 1 ? 1 : 0
        const touchesBottom = maxY >= workH - 2 ? 1 : 0
        const borderTouches = touchesLeft + touchesRight + touchesTop + touchesBottom

        // Abaikan background luar transparan atau noise kecil
        if (borderTouches < 3 && !(borderTouches >= 2 && areaRatio > 0.65) && areaRatio > 0.003 && regionW > workW * 0.025 && regionH > workH * 0.025) {
          transparentRegions.push({ minX, maxX, minY, maxY, count, borderTouches })
        }
      }
    }
  }

  if (transparentRegions.length > 0) {
    // Sort naturally: band vertikal (y) lalu x
    const heights = transparentRegions.map((r) => r.maxY - r.minY + 1).sort((a, b) => a - b)
    const medianH = heights[Math.floor(heights.length / 2)] || 50
    const bandTol = Math.max(8, medianH * 0.5)

    transparentRegions.sort((a, b) => {
      const bandA = Math.round(a.minY / bandTol)
      const bandB = Math.round(b.minY / bandTol)
      if (bandA !== bandB) return bandA - bandB
      return a.minX - b.minX
    })

    const scaleToCanvasX = canvasW / workW
    const scaleToCanvasY = canvasH / workH

    const frames: CameraFrame[] = transparentRegions.map((r, i) => {
      const bw = r.maxX - r.minX + 1
      const bh = r.maxY - r.minY + 1
      const overscanW = Math.max(2.5, bw * 0.018)
      const overscanH = Math.max(2.5, bh * 0.018)

      const workX = Math.max(0, r.minX - overscanW)
      const workY = Math.max(0, r.minY - overscanH)
      const workWActual = Math.min(workW - workX, bw + 2 * overscanW)
      const workHActual = Math.min(workH - workY, bh + 2 * overscanH)

      let fx = Math.max(0, Math.round(workX * scaleToCanvasX))
      let fy = Math.max(0, Math.round(workY * scaleToCanvasY))
      let fw = Math.round(workWActual * scaleToCanvasX)
      let fh = Math.round(workHActual * scaleToCanvasY)

      if (fx + fw > canvasW) fw = Math.max(1, canvasW - fx)
      if (fy + fh > canvasH) fh = Math.max(1, canvasH - fy)

      const fillRatio = r.count / Math.max(1, bw * bh)
      const aspect = Math.abs(bw - bh) / Math.max(1, Math.max(bw, bh))
      let shape: 'rectangle' | 'ellipse' | 'polygon' = 'rectangle'
      if (fillRatio >= 0.65 && fillRatio <= 0.88 && aspect < 0.08) {
        shape = 'ellipse'
      }

      return normalizeFrame({
        id: i + 1,
        order: i,
        x: fx,
        y: fy,
        width: fw,
        height: fh,
        rotation: 0,
        flip_h: false,
        flip_v: false,
        shape,
        clear_zone: 100,
        clear_expansion: 35,
        region_sensitivity: 50,
        min_region_size: 1,
        edge_protection: 60,
        feather: 2,
        edge_cleanup: 0,
        source: 'transparent',
      })
    })

    return { frames, method: 'transparent' }
  }

  // 2. CEK DETEKSI SMART CLEAR (Region Warna & Kontras)
  visited.fill(0)
  const solidRegions: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> = []

  for (let y = Math.round(workH * 0.03); y < workH * 0.97; y += 2) {
    for (let x = Math.round(workW * 0.03); x < workW * 0.97; x += 2) {
      const idx = y * workW + x
      if (visited[idx]) continue

      const r = data[idx * 4]
      const g = data[idx * 4 + 1]
      const b = data[idx * 4 + 2]
      const brightness = (r + g + b) / 3

      // Cari area cerah/placeholder
      if (brightness > 200) {
        let minX = x, maxX = x, minY = y, maxY = y, count = 0
        const queue = [idx]
        visited[idx] = 1

        while (queue.length > 0) {
          const cur = queue.pop()!
          const cx = cur % workW
          const cy = Math.floor(cur / workW)
          count++

          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy

          const neighbors = [
            cy > 0 ? cur - workW : -1,
            cy < workH - 1 ? cur + workW : -1,
            cx > 0 ? cur - 1 : -1,
            cx < workW - 1 ? cur + 1 : -1,
          ]

          for (const n of neighbors) {
            if (n >= 0 && !visited[n]) {
              const nr = data[n * 4]
              const ng = data[n * 4 + 1]
              const nb = data[n * 4 + 2]
              const nbright = (nr + ng + nb) / 3
              if (nbright > 195) {
                visited[n] = 1
                queue.push(n)
              }
            }
          }
        }

        const areaRatio = count / totalPixels
        const regionW = maxX - minX + 1
        const regionH = maxY - minY + 1
        if (areaRatio > 0.015 && areaRatio < 0.85 && regionW > workW * 0.10 && regionH > workH * 0.10) {
          solidRegions.push({ minX, maxX, minY, maxY, count })
        }
      }
    }
  }

  if (solidRegions.length > 0) {
    const heights = solidRegions.map((r) => r.maxY - r.minY + 1).sort((a, b) => a - b)
    const medianH = heights[Math.floor(heights.length / 2)] || 50
    const bandTol = Math.max(8, medianH * 0.5)

    solidRegions.sort((a, b) => {
      const bandA = Math.round(a.minY / bandTol)
      const bandB = Math.round(b.minY / bandTol)
      if (bandA !== bandB) return bandA - bandB
      return a.minX - b.minX
    })

    const scaleToCanvasX = canvasW / workW
    const scaleToCanvasY = canvasH / workH

    const frames: CameraFrame[] = solidRegions.map((r, i) => {
      const fx = Math.round(r.minX * scaleToCanvasX)
      const fy = Math.round(r.minY * scaleToCanvasY)
      const fw = Math.round((r.maxX - r.minX + 1) * scaleToCanvasX)
      const fh = Math.round((r.maxY - r.minY + 1) * scaleToCanvasY)

      return normalizeFrame({
        id: i + 1,
        order: i,
        x: fx,
        y: fy,
        width: fw,
        height: fh,
        rotation: 0,
        flip_h: false,
        flip_v: false,
        shape: 'rectangle',
        clear_zone: 60,
        clear_expansion: 35,
        region_sensitivity: 50,
        min_region_size: 1,
        edge_protection: 60,
        feather: 2,
        edge_cleanup: 0,
        source: 'smart_clear',
      })
    })

    return { frames, method: 'smart_clear' }
  }

  // 3. DEFAULT GRID PROPORSIONAL
  const defaultW = Math.round(canvasW * 0.78)
  const defaultH = Math.round(canvasH * 0.24)
  const defaultX = Math.round((canvasW - defaultW) / 2)
  const startY = Math.round(canvasH * 0.08)
  const gapY = Math.round(canvasH * 0.05)

  const defaultFrames: CameraFrame[] = [0, 1, 2].map((i) =>
    normalizeFrame({
      id: i + 1,
      order: i,
      x: defaultX,
      y: startY + i * (defaultH + gapY),
      width: defaultW,
      height: defaultH,
      rotation: 0,
      flip_h: false,
      flip_v: false,
      shape: 'rectangle',
      clear_zone: 60,
      clear_expansion: 35,
      region_sensitivity: 50,
      min_region_size: 1,
      edge_protection: 60,
      feather: 2,
      edge_cleanup: 0,
      source: 'smart_clear',
    })
  )

  return { frames: defaultFrames, method: 'smart_clear' }
}
