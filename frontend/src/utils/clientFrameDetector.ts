import type { CameraFrame } from '@/types'
import { normalizeFrame } from './frameMask'

/**
 * Client-Side Frame Detection Algorithm.
 * Berjalan langsung di browser (HTML5 Canvas ImageData) sehingga 100% bekerja di
 * segala environment (termasuk Vercel Serverless tanpa PHP GD extension).
 */
export function detectFramesFromImage(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
): { frames: CameraFrame[]; method: 'transparent' | 'smart_clear' } {
  const w = img.naturalWidth || img.width || canvasW
  const h = img.naturalHeight || img.height || canvasH

  // Buat canvas resolusi kerja
  const maxDim = 800
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const workW = Math.round(w * scale)
  const workH = Math.round(h * scale)

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

  // 1. CEK DETEKSI TRANSPARANSI (Alpha < 35)
  const transparentRegions: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> = []

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const idx = y * workW + x
      if (visited[idx]) continue

      const alpha = data[idx * 4 + 3]
      if (alpha < 35) {
        // Flood fill region transparan
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
              if (a < 35) {
                visited[n] = 1
                queue.push(n)
              }
            }
          }
        }

        // Abaikan jika terlalu kecil (< 0.8% kanvas) atau jika menutup seluruh kanvas (> 92%)
        const areaRatio = count / totalPixels
        const regionW = maxX - minX + 1
        const regionH = maxY - minY + 1
        if (areaRatio > 0.008 && areaRatio < 0.92 && regionW > workW * 0.08 && regionH > workH * 0.08) {
          transparentRegions.push({ minX, maxX, minY, maxY, count })
        }
      }
    }
  }

  if (transparentRegions.length > 0) {
    // Urutkan dari atas ke bawah, lalu kiri ke kanan
    transparentRegions.sort((a, b) => {
      const rowDiff = Math.floor(a.minY / (workH * 0.15)) - Math.floor(b.minY / (workH * 0.15))
      if (rowDiff !== 0) return rowDiff
      return a.minX - b.minX
    })

    const scaleToCanvasX = canvasW / workW
    const scaleToCanvasY = canvasH / workH

    const frames: CameraFrame[] = transparentRegions.map((r, i) => {
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
        source: 'transparent',
      })
    })

    return { frames, method: 'transparent' }
  }

  // 2. CEK DETEKSI SMART CLEAR (Warna Terang/Putih Seragam)
  visited.fill(0)
  const solidRegions: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> = []

  for (let y = Math.round(workH * 0.05); y < workH * 0.95; y += 2) {
    for (let x = Math.round(workW * 0.05); x < workW * 0.95; x += 2) {
      const idx = y * workW + x
      if (visited[idx]) continue

      const r = data[idx * 4]
      const g = data[idx * 4 + 1]
      const b = data[idx * 4 + 2]
      const brightness = (r + g + b) / 3

      // Cari area cerah/putih (indikator slot foto umum)
      if (brightness > 215) {
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
              if (nbright > 210) {
                visited[n] = 1
                queue.push(n)
              }
            }
          }
        }

        const areaRatio = count / totalPixels
        const regionW = maxX - minX + 1
        const regionH = maxY - minY + 1
        if (areaRatio > 0.015 && areaRatio < 0.85 && regionW > workW * 0.12 && regionH > workH * 0.12) {
          solidRegions.push({ minX, maxX, minY, maxY, count })
        }
      }
    }
  }

  if (solidRegions.length > 0) {
    solidRegions.sort((a, b) => {
      const rowDiff = Math.floor(a.minY / (workH * 0.15)) - Math.floor(b.minY / (workH * 0.15))
      if (rowDiff !== 0) return rowDiff
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

  // 3. DEFAULT GRID PROPORSIONAL (Jika template solid tanpa lubang yang jelas)
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
