import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

// ========================================================
// PIXELBOOTH — Advanced Intelligent Template Frame Detector
// Ported 1:1 from Laravel TemplateFrameDetector.php
//
// Algorithms:
// 1. Transparency Hole Detection (Alpha channel segmentation, Connected Components)
// 2. Smart Clear Region Detection (Color gradient boundaries, Euclidean flood-fill,
//    Region scoring, Center-obstruction filtering, Projection concentration rotation fitting,
//    Edge reclaim/anti-alias wrapping)
// ========================================================

const WORK_MAX = 400
const EDGE_T = 12
const MERGE_T = 16.0
const MIN_CONFIDENCE = 0.55
const RECLAIM_STEP = 0.5
const RECLAIM_MAX = 8.0
const RECLAIM_STOP_T = 90.0
const RECLAIM_FLAT_T = 24.0

export interface DetectedFrame {
  id: number
  order: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  confidence: number
  source: 'transparent' | 'smart_clear'
  shape?: 'rectangle' | 'square' | 'circle' | 'oval' | 'polygon'
  clear_zone?: number
  clear_expansion?: number
  region_sensitivity?: number
  min_region_size?: number
  edge_protection?: number
  feather?: number
  edge_cleanup?: number
}

export interface DetectionResult {
  detection_method: 'transparent' | 'smart_clear'
  frame_count: number
  frame_configuration: DetectedFrame[]
}

interface DecodedImage {
  width: number
  height: number
  data: Uint8Array | Buffer
  hasAlpha: boolean
}

/**
 * Decode image buffer (PNG, JPEG, WebP) to RGBA raw buffer
 */
export function decodeImage(buffer: Buffer): DecodedImage | null {
  try {
    // Check PNG signature: 89 50 4E 47
    if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const png = PNG.sync.read(buffer)
      return {
        width: png.width,
        height: png.height,
        data: png.data,
        hasAlpha: true,
      }
    }

    // Check JPEG signature: FF D8 FF
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      const raw = jpeg.decode(buffer, { useTArray: true })
      return {
        width: raw.width,
        height: raw.height,
        data: raw.data,
        hasAlpha: false,
      }
    }

    // Try PNG fallback
    try {
      const png = PNG.sync.read(buffer)
      return { width: png.width, height: png.height, data: png.data, hasAlpha: true }
    } catch {
      // Try JPEG fallback
      const raw = jpeg.decode(buffer, { useTArray: true })
      return { width: raw.width, height: raw.height, data: raw.data, hasAlpha: false }
    }
  } catch (err) {
    console.warn('decodeImage error:', err)
    return null
  }
}

/**
 * Main Frame Detection function
 */
export function detectFramesFromBuffer(
  buffer: Buffer,
  targetW?: number,
  targetH?: number
): DetectionResult | null {
  const decoded = decodeImage(buffer)
  if (!decoded || decoded.width <= 0 || decoded.height <= 0) {
    return null
  }

  const canvasW = targetW || decoded.width
  const canvasH = targetH || decoded.height

  // 1. KONDISI 1 — DETEKSI TRANSPARANSI (PNG / Alpha)
  if (decoded.hasAlpha) {
    const transparentRes = detectTransparentRegions(decoded, canvasW, canvasH)
    if (transparentRes && transparentRes.frame_count > 0) {
      return transparentRes
    }
  }

  // 2. KONDISI 2 — SMART CLEAR (Region & Gradient Segmentation)
  return detectSmartClear(decoded, canvasW, canvasH)
}

// -------------------------------------------------------------
// STAGE 1: Transparency Detection
// -------------------------------------------------------------
function detectTransparentRegions(
  decoded: DecodedImage,
  targetW: number,
  targetH: number
): DetectionResult | null {
  const srcW = decoded.width
  const srcH = decoded.height

  const scale = Math.min(1.0, WORK_MAX / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  // Downsample to work grid
  const binary: number[][] = []
  let transparentCount = 0

  for (let y = 0; y < h; y++) {
    const row: number[] = []
    const srcY = Math.min(srcH - 1, Math.floor(y / scale))
    for (let x = 0; x < w; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x / scale))
      const idx = (srcY * srcW + srcX) * 4
      const alpha = decoded.data[idx + 3]
      // Alpha < 60 considered transparent hole (GD alpha >= 24 corresponds to < 60 alpha out of 255)
      const isTransparent = alpha < 60 ? 1 : 0
      if (isTransparent) transparentCount++
      row.push(isTransparent)
    }
    binary.push(row)
  }

  const totalArea = w * h
  if (transparentCount < Math.max(40, Math.round(0.003 * totalArea))) {
    return null // Tidak ada transparansi signifikan
  }

  // Connected Components (4-connectivity)
  const visited: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false))
  interface Component {
    area: number
    minX: number
    maxX: number
    minY: number
    maxY: number
    bw: number
    bh: number
    borderTouches: number
  }
  const components: Component[] = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!binary[y][x] || visited[y][x]) continue

      const queue: Array<[number, number]> = [[x, y]]
      visited[y][x] = true
      let minX = x, maxX = x, minY = y, maxY = y
      let area = 0

      while (queue.length > 0) {
        const [px, py] = queue.pop()!
        area++
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py

        const neighbors: Array<[number, number]> = [
          [px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]
        ]
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[ny][nx] && !visited[ny][nx]) {
            visited[ny][nx] = true
            queue.push([nx, ny])
          }
        }
      }

      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      const touchesLeft = minX <= 1 ? 1 : 0
      const touchesRight = maxX >= w - 2 ? 1 : 0
      const touchesTop = minY <= 1 ? 1 : 0
      const touchesBottom = maxY >= h - 2 ? 1 : 0
      const borderTouches = touchesLeft + touchesRight + touchesTop + touchesBottom

      components.push({ area, minX, maxX, minY, maxY, bw, bh, borderTouches })
    }
  }

  if (components.length === 0) return null

  // Filter background transparan vs photo hole interior
  const selected: Component[] = []
  for (const comp of components) {
    const relArea = comp.area / totalArea
    if (comp.borderTouches >= 3) continue
    if (comp.borderTouches >= 2 && relArea > 0.65) continue
    if (relArea < 0.003) continue
    const minDim = Math.min(w, h)
    if (Math.min(comp.bw, comp.bh) < minDim * 0.025) continue
    selected.push(comp)
  }

  if (selected.length === 0) return null

  const scaleX = targetW / w
  const scaleY = targetH / h
  const slots: any[] = []

  for (const comp of selected) {
    const bw = comp.bw
    const bh = comp.bh
    const minX = comp.minX
    const minY = comp.minY

    // 1.8% overscan untuk cover penuh
    const overscanW = Math.max(2.5, bw * 0.018)
    const overscanH = Math.max(2.5, bh * 0.018)

    const workX = Math.max(0.0, minX - overscanW)
    const workY = Math.max(0.0, minY - overscanH)
    const workW = Math.min(w - workX, bw + 2 * overscanW)
    const workH = Math.min(h - workY, bh + 2 * overscanH)

    let finalX = Math.max(0, Math.round(workX * scaleX))
    let finalY = Math.max(0, Math.round(workY * scaleY))
    let finalW = Math.round(workW * scaleX)
    let finalH = Math.round(workH * scaleY)

    if (finalX + finalW > targetW) finalW = Math.max(1, targetW - finalX)
    if (finalY + finalH > targetH) finalH = Math.max(1, targetH - finalY)

    const fillRatio = comp.area / Math.max(1, bw * bh)
    const aspect = Math.abs(bw - bh) / Math.max(1, Math.max(bw, bh))
    let shape: 'rectangle' | 'square' | 'circle' | 'oval' | 'polygon' = 'rectangle'
    if (fillRatio > 0.88) {
      shape = aspect < 0.06 ? 'square' : 'rectangle'
    } else if (fillRatio >= 0.65 && fillRatio <= 0.88) {
      shape = aspect < 0.08 ? 'circle' : 'oval'
    } else {
      shape = 'polygon'
    }

    slots.push({
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
      rotation: 0.0,
      confidence: 100.0,
      source: 'transparent',
      shape,
      clear_zone: 100,
      clear_expansion: 35,
      region_sensitivity: 50,
      min_region_size: 1,
      edge_protection: 60,
      feather: 2,
      edge_cleanup: 0,
    })
  }

  if (slots.length === 0) return null
  const sorted = sortSlots(slots)

  return {
    detection_method: 'transparent',
    frame_count: sorted.length,
    frame_configuration: sorted.map((s, idx) => ({ ...s, id: idx + 1, order: idx })),
  }
}

// -------------------------------------------------------------
// STAGE 2: Smart Clear (Color Segmentation & Boundary Analysis)
// -------------------------------------------------------------
function detectSmartClear(
  decoded: DecodedImage,
  targetW: number,
  targetH: number
): DetectionResult | null {
  const { pixels, width: w, height: h } = buildWorkImage(decoded)

  // 1) Segmentasi region berbasis gradien & flood-fill
  const regions = segmentRegions(pixels, w, h)
  if (!regions || regions.length === 0) return null

  // 2) Scoring region & reference signature boost
  const canvasArea = w * h
  const candidates = scoreRegions(regions, pixels, w, h, canvasArea)
  if (!candidates || candidates.length === 0) return null

  // 3) Seleksi frame (buang background, obstructed, duplikat)
  const selected = selectFrames(candidates)
  if (!selected || selected.length === 0) return null

  // 4) Fitting rotasi via projection concentration & edge reclaim
  const slots: any[] = []
  for (const cand of selected) {
    const slot = fitRegion(cand, cand.region.pixels, pixels, w, h)
    if (slot) {
      slot.source = 'smart_clear'
      slots.push(slot)
    }
  }

  if (slots.length === 0) return null
  const sorted = sortSlots(slots)

  // Skala ke dimensi kanvas target
  const scaleX = targetW / w
  const scaleY = targetH / h

  const frameConfigs: DetectedFrame[] = sorted.map((slot, index) => {
    const fx = Math.max(0, Math.round(slot.x * scaleX))
    const fy = Math.max(0, Math.round(slot.y * scaleY))
    let fw = Math.round(slot.width * scaleX)
    let fh = Math.round(slot.height * scaleY)

    if (fx + fw > targetW) fw = Math.max(1, targetW - fx)
    if (fy + fh > targetH) fh = Math.max(1, targetH - fy)

    return {
      id: index + 1,
      order: index,
      x: fx,
      y: fy,
      width: fw,
      height: fh,
      rotation: slot.rotation,
      confidence: slot.confidence,
      source: 'smart_clear',
      shape: 'rectangle',
      clear_zone: 60,
      clear_expansion: 35,
      region_sensitivity: 50,
      min_region_size: 1,
      edge_protection: 60,
      feather: 2,
      edge_cleanup: 0,
    }
  })

  return {
    detection_method: 'smart_clear',
    frame_count: frameConfigs.length,
    frame_configuration: frameConfigs,
  }
}

// -------------------------------------------------------------
// Helper Methods for Smart Clear
// -------------------------------------------------------------

function buildWorkImage(decoded: DecodedImage): { pixels: number[][][]; width: number; height: number } {
  const srcW = decoded.width
  const srcH = decoded.height
  const scale = Math.min(1.0, WORK_MAX / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  // Resample
  const temp: number[][][] = []
  for (let y = 0; y < height; y++) {
    const row: number[][] = []
    const sy = Math.min(srcH - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale))
      const idx = (sy * srcW + sx) * 4
      row.push([decoded.data[idx], decoded.data[idx + 1], decoded.data[idx + 2]])
    }
    temp.push(row)
  }

  // 3x3 Box Blur
  const blurred: number[][][] = []
  for (let y = 0; y < height; y++) {
    const row: number[][] = []
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          r += temp[ny][nx][0]
          g += temp[ny][nx][1]
          b += temp[ny][nx][2]
          n++
        }
      }
      row.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)])
    }
    blurred.push(row)
  }

  return { pixels: blurred, width, height }
}

function channelDiff(a: number[], b: number[]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function colorDist(a: number[], b: number[]): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function segmentRegions(px: number[][][], w: number, h: number): Array<{ id: number; pixels: number[] }> {
  // Peta Gradien
  const grad: number[][] = []
  for (let y = 0; y < h; y++) {
    const row: number[] = []
    for (let x = 0; x < w; x++) {
      let g = 0.0
      if (x + 1 < w) g = Math.max(g, channelDiff(px[y][x], px[y][x + 1]))
      if (y + 1 < h) g = Math.max(g, channelDiff(px[y][x], px[y + 1][x]))
      row.push(g)
    }
    grad.push(row)
  }

  // Boundary + dilasi 1 iterasi (8-tetangga)
  const boundary = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grad[y][x] > EDGE_T) {
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= w) continue
            boundary[ny * w + nx] = 1
          }
        }
      }
    }
  }

  // Connected Component Labeling
  const labels = new Int32Array(w * h)
  const regions: Array<{ id: number; pixels: number[] }> = []
  let currentId = 0

  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== 0 || boundary[start] !== 0) continue

    currentId++
    const stack = [start]
    labels[start] = currentId
    const members = [start]

    while (stack.length > 0) {
      const cur = stack.pop()!
      const cx = cur % w
      const cy = Math.floor(cur / w)
      const curPx = px[cy][cx]

      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue
          const ni = ny * w + nx
          if (labels[ni] !== 0 || boundary[ni] !== 0) continue
          if (colorDist(curPx, px[ny][nx]) > MERGE_T) continue

          labels[ni] = currentId
          stack.push(ni)
          members.push(ni)
        }
      }
    }

    regions.push({ id: currentId, pixels: members })
  }

  return regions
}

interface Candidate {
  region: { id: number; pixels: number[] }
  stats: any
  confidence: number
  reject: string | null
  similarity?: number
}

function scoreRegions(
  regions: Array<{ id: number; pixels: number[] }>,
  px: number[][][],
  w: number,
  h: number,
  canvasArea: number
): Candidate[] {
  const candidates: Candidate[] = []

  for (const region of regions) {
    const stats = regionStats(region, px, w, h)
    if (!stats) continue

    let reject: string | null = null
    if (stats.edgesTouched >= 3) reject = 'background'

    const relArea = stats.area / canvasArea
    if (reject === null && relArea > 0.88) reject = 'background'

    if (reject === null) {
      const fracW = stats.bw / w
      const fracH = stats.bh / h
      if ((fracW >= 0.96 && fracH >= 0.9) || (fracH >= 0.96 && fracW >= 0.9)) {
        reject = 'background'
      }
    }

    if (reject === null) {
      const coverage = centerCoverage(stats.set, stats.bx, stats.by, stats.bw, stats.bh, w, h)
      if (coverage < 0.6) reject = 'obstructed'
    }

    const sizeScore = Math.min(1.0, relArea / 0.03)
    const consistencyScore = Math.max(0.0, Math.min(1.0, 1.0 - stats.std / 50))
    const boundaryScore = Math.max(0.0, Math.min(1.0, stats.perimGrad / 45))
    const bboxArea = Math.max(1, stats.bw * stats.bh)
    const fill = stats.area / bboxArea
    const rectScore = Math.max(0.0, Math.min(1.0, (fill - 0.45) / 0.45))
    const minSide = Math.min(stats.bw, stats.bh)
    const maxSide = Math.max(stats.bw, stats.bh)
    const sideRatio = minSide / Math.max(1, maxSide)
    const aspectScore = sideRatio >= 0.18 ? 1.0 : (sideRatio / 0.18) * 0.7
    const positionScore = Math.max(0.0, 1.0 - 0.35 * stats.edgesTouched)

    const confidence =
      0.28 * sizeScore +
      0.18 * consistencyScore +
      0.17 * boundaryScore +
      0.12 * rectScore +
      0.13 * positionScore +
      0.07 * aspectScore

    candidates.push({
      region,
      stats,
      confidence,
      reject,
    })
  }

  if (candidates.length === 0) return []

  candidates.sort((a, b) => b.confidence - a.confidence)

  let refStats: any = null
  for (const c of candidates) {
    if (c.reject === null) {
      refStats = c.stats
      break
    }
  }

  if (refStats) {
    for (const cand of candidates) {
      if (cand.reject !== null) continue
      const st = cand.stats
      const dColor = colorDist(st.avg, refStats.avg)
      const simColor = Math.max(0.0, 1.0 - dColor / 160)
      const simVar = Math.max(0.0, 1.0 - Math.abs(st.std - refStats.std) / 60)
      const simSize = Math.min(st.area, refStats.area) / Math.max(1, Math.max(st.area, refStats.area))
      const similarity = simColor * (0.6 + 0.4 * simVar) * (0.5 + 0.5 * simSize)
      cand.similarity = similarity
      cand.confidence = Math.min(0.99, cand.confidence + 0.06 * similarity)
    }
  }

  return candidates
}

function regionStats(
  region: { id: number; pixels: number[] },
  px: number[][][],
  w: number,
  h: number
): any | null {
  const pixels = region.pixels
  const area = pixels.length
  if (area < Math.max(40, Math.round(0.03 * w * h))) return null

  const memberSet = new Set<number>(pixels)
  let sumR = 0, sumG = 0, sumB = 0
  let sqR = 0, sqG = 0, sqB = 0
  let minX = w, maxX = -1, minY = h, maxY = -1
  let gradSum = 0, gradN = 0

  for (const idx of pixels) {
    const x = idx % w
    const y = Math.floor(idx / w)
    const [r, g, b] = px[y][x]
    sumR += r; sumG += g; sumB += b
    sqR += r * r; sqG += g * g; sqB += b * b
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y

    let isPerimeter = false
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [ox, oy] of offsets) {
      const nx = x + ox
      const ny = y + oy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !memberSet.has(ny * w + nx)) {
        isPerimeter = true
        break
      }
    }

    if (isPerimeter) {
      let maxG = 0
      const cur = px[y][x]
      for (const [ox, oy] of offsets) {
        const nx = x + ox
        const ny = y + oy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        if (memberSet.has(ny * w + nx)) continue
        maxG = Math.max(maxG, channelDiff(cur, px[ny][nx]))
      }
      gradSum += maxG
      gradN++
    }
  }

  const n = area
  const avgR = sumR / n
  const avgG = sumG / n
  const avgB = sumB / n
  const varR = Math.max(0, sqR / n - avgR * avgR)
  const varG = Math.max(0, sqG / n - avgG * avgG)
  const varB = Math.max(0, sqB / n - avgB * avgB)
  const std = (Math.sqrt(varR) + Math.sqrt(varG) + Math.sqrt(varB)) / 3

  let edgesTouched = 0
  if (minX <= 1) edgesTouched++
  if (maxX >= w - 2) edgesTouched++
  if (minY <= 1) edgesTouched++
  if (maxY >= h - 2) edgesTouched++

  return {
    area,
    bx: minX,
    by: minY,
    bw: maxX - minX + 1,
    bh: maxY - minY + 1,
    avg: [avgR, avgG, avgB],
    std,
    edgesTouched,
    perimGrad: gradN > 0 ? gradSum / gradN : 0.0,
    set: memberSet,
  }
}

function centerCoverage(set: Set<number>, bx: number, by: number, bw: number, bh: number, w: number, h: number): number {
  const zx0 = bx + Math.floor(bw * 0.32)
  const zy0 = by + Math.floor(bh * 0.32)
  const zx1 = bx + Math.ceil(bw * 0.68)
  const zy1 = by + Math.ceil(bh * 0.68)
  const zw = Math.max(1, zx1 - zx0)
  const zh = Math.max(1, zy1 - zy0)

  let hits = 0
  let total = 0
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 7; gx++) {
      const px = Math.min(w - 1, zx0 + Math.round((gx / 6) * (zw - 1)))
      const py = Math.min(h - 1, zy0 + Math.round((gy / 6) * (zh - 1)))
      total++
      if (set.has(py * w + px)) hits++
    }
  }

  return total > 0 ? hits / total : 0.0
}

function selectFrames(candidates: Candidate[]): Candidate[] {
  candidates.sort((a, b) => b.confidence - a.confidence)

  // Obstruction inheritance
  for (const a of candidates) {
    if (a.reject !== 'obstructed') continue
    const sa = a.stats
    for (const b of candidates) {
      if (b.reject !== null) continue
      const sb = b.stats
      if (sa.area < 2 * sb.area) continue
      const slack = 2
      const contains =
        sb.bx >= sa.bx - slack &&
        sb.by >= sa.by - slack &&
        sb.bx + sb.bw <= sa.bx + sa.bw + slack &&
        sb.by + sb.bh <= sa.by + sa.bh + slack
      if (contains) b.reject = 'obstruction-content'
    }
  }

  // Surround rejection
  const rejected = new Set<number>()
  for (let ia = 0; ia < candidates.length; ia++) {
    const a = candidates[ia]
    if (a.reject !== null) {
      rejected.add(ia)
      continue
    }
    const sa = a.stats
    const fillA = sa.area / Math.max(1, sa.bw * sa.bh)
    if (fillA >= 0.55 && sa.edgesTouched < 2) continue

    for (let ib = 0; ib < candidates.length; ib++) {
      if (ia === ib || rejected.has(ib)) continue
      const b = candidates[ib]
      const sb = b.stats
      if (sa.area < 2 * sb.area) continue
      const slack = 2
      const contains =
        sb.bx >= sa.bx - slack &&
        sb.by >= sa.by - slack &&
        sb.bx + sb.bw <= sa.bx + sa.bw + slack &&
        sb.by + sb.bh <= sa.by + sa.bh + slack
      if (contains) {
        rejected.add(ia)
        break
      }
    }
  }

  const selected: Candidate[] = []
  for (let ci = 0; ci < candidates.length; ci++) {
    if (rejected.has(ci)) continue
    const cand = candidates[ci]
    if (cand.confidence < MIN_CONFIDENCE) continue

    const st = cand.stats
    let duplicate = false
    for (const sel of selected) {
      const ss = sel.stats
      const ix = Math.max(0, Math.min(st.bx + st.bw, ss.bx + ss.bw) - Math.max(st.bx, ss.bx))
      const iy = Math.max(0, Math.min(st.by + st.bh, ss.by + ss.bh) - Math.max(st.by, ss.by))
      const overlap = ix * iy
      if (overlap > 0.35 * Math.max(1, Math.min(st.area, ss.area))) {
        duplicate = true
        break
      }
    }
    if (!duplicate) selected.push(cand)
  }

  return selected
}

function fitRegion(
  cand: Candidate,
  pixels: number[],
  px: number[][][],
  w: number,
  h: number
): any | null {
  const n = pixels.length
  if (n < 4) return null

  let cx = 0, cy = 0
  for (const idx of pixels) {
    cx += idx % w
    cy += Math.floor(idx / w)
  }
  cx /= n
  cy /= n

  const coarsePts = samplePoints(pixels, w, 3500)
  const finePts = samplePoints(pixels, w, 9000)

  const projScore = (pts: Array<[number, number]>, deg: number): number => {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const cu: Record<number, number> = {}
    const cv: Record<number, number> = {}

    for (const [x, y] of pts) {
      const dx = x - cx
      const dy = y - cy
      const u = dx * cos + dy * sin
      const v = -dx * sin + dy * cos
      const iu = Math.floor(u / 2)
      const iv = Math.floor(v / 2)
      cu[iu] = (cu[iu] || 0) + 1
      cv[iv] = (cv[iv] || 0) + 1
    }

    let s = 0
    for (const c of Object.values(cu)) s += c * c
    for (const c of Object.values(cv)) s += c * c
    return s
  }

  let bestDeg = 0.0
  let bestScore = -1.0

  for (let deg = -46.0; deg <= 46.0; deg += 2.0) {
    const sc = projScore(coarsePts, deg)
    if (sc > bestScore) {
      bestScore = sc
      bestDeg = deg
    }
  }

  for (let deg = bestDeg - 2.5; deg <= bestDeg + 2.5; deg += 0.25) {
    const sc = projScore(finePts, deg)
    if (sc > bestScore) {
      bestScore = sc
      bestDeg = deg
    }
  }

  const sideAvg = (projScore(finePts, bestDeg - 8) + projScore(finePts, bestDeg + 8)) / 2
  if (bestScore <= 0 || (bestScore - sideAvg) / bestScore < 0.015) {
    bestDeg = 0.0
  }

  let deg = bestDeg
  while (deg > 45) deg -= 90
  while (deg <= -45) deg += 90
  if (Math.abs(deg) < 0.8) deg = 0.0

  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  let uMin = Infinity, vMin = Infinity
  let uMax = -Infinity, vMax = -Infinity
  let vAtUMin = 0, vAtUMax = 0, uAtVMin = 0, uAtVMax = 0

  for (const idx of pixels) {
    const dx = (idx % w) - cx
    const dy = Math.floor(idx / w) - cy
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos

    if (u < uMin) { uMin = u; vAtUMin = v }
    if (u > uMax) { uMax = u; vAtUMax = v }
    if (v < vMin) { vMin = v; uAtVMin = u }
    if (v > vMax) { vMax = v; uAtVMax = u }
  }

  // Reclaim edge walks
  uMin -= reclaimWalk(cx + uMin * cos - vAtUMin * sin, cy + uMin * sin + vAtUMin * cos, -cos, -sin, px, w, h)
  uMax += reclaimWalk(cx + uMax * cos - vAtUMax * sin, cy + uMax * sin + vAtUMax * cos, cos, sin, px, w, h)
  vMin -= reclaimWalk(cx + uAtVMin * cos - vMin * sin, cy + uAtVMin * sin + vMin * cos, sin, -cos, px, w, h)
  vMax += reclaimWalk(cx + uAtVMax * cos - vMax * sin, cy + uAtVMax * sin + vMax * cos, -sin, cos, px, w, h)

  const fw = Math.max(1.0, uMax - uMin)
  const fh = Math.max(1.0, vMax - vMin)
  const uMid = (uMin + uMax) / 2
  const vMid = (vMin + vMax) / 2
  const fx = cx + uMid * cos - vMid * sin
  const fy = cy + uMid * sin + vMid * cos

  return {
    x: fx - fw / 2,
    y: fy - fh / 2,
    width: fw,
    height: fh,
    rotation: Math.round(deg * 10) / 10,
    confidence: Math.round(cand.confidence * 1000) / 10,
  }
}

function samplePoints(pixels: number[], w: number, cap: number): Array<[number, number]> {
  const n = pixels.length
  if (n <= cap) {
    return pixels.map((idx) => [idx % w, Math.floor(idx / w)])
  }
  // Deterministic pseudo-random
  let seed = 0x504f544f
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const out: Array<[number, number]> = []
  for (let i = 0; i < cap; i++) {
    const idx = pixels[Math.floor(rand() * n)]
    out.push([idx % w, Math.floor(idx / w)])
  }
  return out
}

function reclaimWalk(
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  px: number[][][],
  w: number,
  h: number
): number {
  const sample = (x: number, y: number): number[] | null => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (iy < 0 || iy >= h || ix < 0 || ix >= w) return null
    return px[iy][ix]
  }

  const start = sample(sx, sy)
  if (!start) return 0.0
  let lastGood = 0.0

  for (let t = RECLAIM_STEP; t <= RECLAIM_MAX; t += RECLAIM_STEP) {
    const c = sample(sx + dx * t, sy + dy * t)
    if (!c) break
    const next = sample(sx + dx * (t + 1.0), sy + dy * (t + 1.0))
    const flatOther =
      colorDist(c, start) > RECLAIM_STOP_T &&
      (!next || colorDist(c, next) <= RECLAIM_FLAT_T)
    if (flatOther) break
    lastGood = t
  }

  return lastGood
}

function sortSlots(slots: any[]): any[] {
  if (slots.length <= 1) return slots
  const heights = slots.map((s) => s.height).sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)]
  const bandTol = Math.max(8.0, medianH * 0.5)

  return [...slots].sort((a, b) => {
    const bandA = Math.round(a.y / bandTol)
    const bandB = Math.round(b.y / bandTol)
    if (bandA !== bandB) return bandA - bandB
    return a.x - b.x
  })
}
