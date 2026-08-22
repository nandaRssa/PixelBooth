// ==========================================
// PIXELBOOTH — Frame Mask Engine (frontend)
// Smart Remove v2 — LAB-approximate perceptual color distance,
// soft alpha ramp, Sobel gradient-guided edge damping,
// 4-pass anti-fringe, Gaussian feather.
//
// Prinsip:
// - Frame manual user adalah sumber kebenaran (tanpa deteksi warna global).
// - Hard Clear Zone (tengah frame) = seed yang WAJIB di-clear.
// - Clear meluas ke Connected Region yang kontinu dengan seed,
//   dibatasi Clear Expansion, Region Sensitivity & Edge Protection.
// - Elemen desain di perifer dipertahankan (kamera di-mask di bawahnya).
// ==========================================

import type { CameraFrame, BrushPoint, ClearArea } from '@/types'

export const WORK_MAX = 1200

/** Normalisasi frame parsial menjadi konfigurasi lengkap ber-default. */
export function normalizeFrame(frame: Partial<CameraFrame>): CameraFrame {
  const areas = (v: unknown): ClearArea[] => {
    if (!Array.isArray(v)) return []
    const out: ClearArea[] = []
    for (const a of v as Record<string, unknown>[]) {
      if (!a || typeof a !== 'object') continue
      const w = Number(a.w ?? a.width ?? 0)
      const h = Number(a.h ?? a.height ?? 0)
      if (w <= 0 || h <= 0) continue
      out.push({ x: Number(a.x ?? 0), y: Number(a.y ?? 0), w, h })
    }
    return out
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

  const points = (v: unknown): BrushPoint[] => {
    if (!Array.isArray(v)) return []
    const out: BrushPoint[] = []
    for (const p of v as Record<string, unknown>[]) {
      if (!p || typeof p !== 'object') continue
      const pt: BrushPoint = { x: Number(p.x ?? 0), y: Number(p.y ?? 0) }
      // Urutan strok untuk resolusi Remove vs Keep (strok terakhir menang)
      if (typeof p.s === 'number' && Number.isFinite(p.s)) pt.s = Math.round(p.s)
      out.push(pt)
      if (out.length >= 48) break
    }
    return out
  }

  return {
    id: Number(frame.id ?? 0),
    order: Number(frame.order ?? 0),
    x: Number(frame.x ?? 0),
    y: Number(frame.y ?? 0),
    width: Math.max(1, Number(frame.width ?? 1)),
    height: Math.max(1, Number(frame.height ?? 1)),
    rotation: Number(frame.rotation ?? 0),
    flip_h: Boolean(frame.flip_h ?? false),
    flip_v: Boolean(frame.flip_v ?? false),
    clear_zone: clamp(Number(frame.clear_zone ?? 60), 5, 100),
    clear_expansion: clamp(Number(frame.clear_expansion ?? 25), 0, 200),
    region_sensitivity: clamp(Number(frame.region_sensitivity ?? 50), 0, 100),
    min_region_size: clamp(Number(frame.min_region_size ?? 1), 0, 50),
    edge_protection: clamp(Number(frame.edge_protection ?? 60), 0, 100),
    feather: clamp(Number(frame.feather ?? 2), 0, 20),
    edge_cleanup: clamp(Math.round(Number(frame.edge_cleanup ?? 0) * 10) / 10, 0, 5),
    confidence:
      typeof frame.confidence === 'number' && Number.isFinite(frame.confidence)
        ? Math.round(frame.confidence * 10) / 10
        : null,
    source: frame.source ? String(frame.source) : null,
    protected_areas: areas(frame.protected_areas),
    remove_areas: areas(frame.remove_areas),
    remove_seeds: points(frame.remove_seeds),
    protect_seeds: points(frame.protect_seeds),
    keep_seeds: points(frame.keep_seeds),
  }
}

export interface WorkTemplate {
  data: ImageData
  width: number
  height: number
  scale: number
}

/** Turunkan resolusi template ke resolusi kerja untuk analisis cepat. */
export function downscaleTemplate(
  source: HTMLImageElement | HTMLCanvasElement,
  canvasW: number,
  canvasH: number
): WorkTemplate {
  const scale = Math.min(1, WORK_MAX / Math.max(canvasW, canvasH))
  const gw = Math.max(1, Math.round(canvasW * scale))
  const gh = Math.max(1, Math.round(canvasH * scale))

  const cv = document.createElement('canvas')
  cv.width = gw
  cv.height = gh
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas tidak tersedia')
  ctx.drawImage(source, 0, 0, gw, gh)

  return { data: ctx.getImageData(0, 0, gw, gh), width: gw, height: gh, scale }
}

export interface HoleMask {
  /** bbox pada koordinat CANVAS (sudah dikonversi dari ruang kerja) */
  bx: number
  by: number
  bw: number
  bh: number
  /** RGBA bbox-size; alpha = jumlah lubang (0..255) */
  imageData: ImageData
  /** Overlay tint region brush (remove=merah, protect=kuning, keep=hijau) */
  overlay: ImageData
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/**
 * Hitung mask lubang kamera untuk satu frame.
 * Alpha hasil: 255 = lubang penuh (kamera terlihat), 0 = desain dipertahankan.
 */
export function computeHoleMask(
  wt: WorkTemplate,
  frame: CameraFrame
): HoleMask | null {
  const f = normalizeFrame(frame)

  // KONDISI 1 — Transparency Detection:
  // JANGAN MENGHAPUS DESAIN / JANGAN RUN SMART CLEAR.
  // Template desain asli tetap utuh 100% dan transparansi asli digunakan langsung.
  if (f.source === 'transparent' || frame.source === 'transparent') {
    return null
  }

  const { data: wd, width: gw, height: gh, scale } = wt

  // Geometri frame pada ruang kerja
  const fw = Math.max(2, f.width * scale)
  const fh = Math.max(2, f.height * scale)
  const rot = (f.rotation * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const cx = f.x * scale + fw / 2
  const cy = f.y * scale + fh / 2
  const hw = fw / 2
  const hh = fh / 2

  // Hard Clear Zone (setengah-ukuran pada ruang lokal frame)
  const hzW = (fw * f.clear_zone) / 200
  const hzH = (fh * f.clear_zone) / 200
  const dHard = Math.sqrt(hzW * hzW + hzH * hzH)
  const expPx = ((f.clear_expansion / 100) * Math.min(fw, fh))
  const dMax = dHard + expPx

  // Sangat peka warna: perubahan warna sekecil apa pun dipertahankan.
  // Default sens 50 -> tol 10. Harus identik dengan backend.
  const tol = 1 + f.region_sensitivity * 0.18
  const ep = f.edge_protection / 100

  // Area manual disimpan dari sudut kiri-atas frame; konversi ke basis pusat.
  // Area adalah KONTEN frame → posisinya ikut dicerminkan flip.
  const fxs = f.flip_h ? -1 : 1
  const fys = f.flip_v ? -1 : 1
  const protLocal = f.protected_areas.map((a) => [a.x * scale - hw, a.y * scale - hh, a.w * scale, a.h * scale])
  const remLocal = f.remove_areas.map((a) => [a.x * scale - hw, a.y * scale - hh, a.w * scale, a.h * scale])

  // Bounding box axis-aligned frame yang dirotasi (clamp ke canvas kerja)
  const corners: Array<[number, number]> = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lx, ly] of corners) {
    const px = cx + lx * cos - ly * sin
    const py = cy + lx * sin + ly * cos
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  const bx0 = Math.max(0, Math.floor(minX) - 1)
  const by0 = Math.max(0, Math.floor(minY) - 1)
  const bx1 = Math.min(gw - 1, Math.ceil(maxX) + 1)
  const by1 = Math.min(gh - 1, Math.ceil(maxY) + 1)
  const bw = bx1 - bx0 + 1
  const bh = by1 - by0 + 1
  if (bw <= 0 || bh <= 0) return null

  // Klasifikasi sel grid
  const inside = new Uint8Array(bw * bh)
  const seed = new Uint8Array(bw * bh)
  const prot = new Uint8Array(bw * bh)
  const rem = new Uint8Array(bw * bh)

  for (let gy = by0; gy <= by1; gy++) {
    for (let gx = bx0; gx <= bx1; gx++) {
      const dx = gx + 0.5 - cx
      const dy = gy + 0.5 - cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue
      const idx = (gy - by0) * bw + (gx - bx0)
      inside[idx] = 1
      if (Math.abs(lx) <= hzW && Math.abs(ly) <= hzH) seed[idx] = 1
      // Uji area pada koordinat lokal yang sudah dicerminkan flip
      const alx = lx * fxs
      const aly = ly * fys
      for (const [ax, ay, aw, ah] of protLocal) {
        if (alx >= ax && alx <= ax + aw && aly >= ay && aly <= ay + ah) {
          prot[idx] = 1
          break
        }
      }
      for (const [ax, ay, aw, ah] of remLocal) {
        if (alx >= ax && alx <= ax + aw && aly >= ay && aly <= ay + ah) {
          rem[idx] = 1
          break
        }
      }
    }
  }

  // ── SMART REMOVE v2: LAB-approximate seed statistics ──────────────────
  // Hitung mean weighted-RGB seed + standar deviasi untuk soft alpha ramp.
  // Weighted RGB (2r²+4g²+3b²) mendekati persepsi LAB dengan overhead minimal.
  let ws = 0, ms = 0, ls = 0, n = 0
  let varSum = 0
  const seedSamples: number[] = []
  for (let i = 0; i < seed.length; i++) {
    if (!seed[i]) continue
    const o = ((by0 + Math.floor(i / bw)) * gw + (bx0 + (i % bw))) * 4
    const r = wd.data[o], g = wd.data[o + 1], b = wd.data[o + 2]
    ws += r; ms += g; ls += b
    seedSamples.push(r, g, b)
    n++
  }
  if (n === 0) return null
  const avgR = ws / n
  const avgG = ms / n
  const avgB = ls / n

  // Standar deviasi LAB-approx
  for (let i = 0; i < seedSamples.length; i += 3) {
    const dr = seedSamples[i] - avgR
    const dg = seedSamples[i + 1] - avgG
    const db = seedSamples[i + 2] - avgB
    varSum += (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9
  }
  const seedStddev = Math.max(4, Math.sqrt(varSum / n))

  // ===== REGION BRUSH (Remove / Protect / Keep-Restore) =====
  // Sapuan kuas disimpan sebagai SEED POINT. Seluruh region terhubung
  // (4-arah, mirip warna seed-nya sendiri) ikut diproses sampai bertemu
  // boundary warna berbeda / area lindungan / batas frame. Ukuran brush
  // TIDAK membatasi ukuran region. Harus identik dengan FrameMaskService.
  const tolR = Math.max(tol * 2, 12)
  const EMPTY: Uint8Array = new Uint8Array(inside.length)
  const seedToWork = (ax: number, ay: number): [number, number] | null => {
    // Seed disimpan dari sudut kiri-atas frame pada ruang KONTEN (ikut flip)
    const alx = ax * scale - hw
    const aly = ay * scale - hh
    const lx = alx * fxs
    const ly = aly * fys
    const dx = lx * cos - ly * sin
    const dy = lx * sin + ly * cos
    const gx = Math.round(cx + dx)
    const gy = Math.round(cy + dy)
    if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) return null
    const idx = (gy - by0) * bw + (gx - bx0)
    if (!inside[idx]) return null
    return [gx, gy]
  }
  const floodRegion = (out: Uint8Array, walls: Uint8Array, sx: number, sy: number) => {
    const startIdx = (sy - by0) * bw + (sx - bx0)
    if (out[startIdx] || walls[startIdx] || !inside[startIdx]) return
    const o0 = (sy * gw + sx) * 4
    const r0 = wd.data[o0]
    const g0 = wd.data[o0 + 1]
    const b0 = wd.data[o0 + 2]
    out[startIdx] = 1
    const stack: number[] = [startIdx]
    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (out[nidx] || walls[nidx] || !inside[nidx]) continue
        const o = (ny * gw + nx) * 4
        const diff = Math.max(
          Math.abs(wd.data[o] - r0),
          Math.abs(wd.data[o + 1] - g0),
          Math.abs(wd.data[o + 2] - b0)
        )
        if (diff > tolR) continue
        out[nidx] = 1
        stack.push(nidx)
      }
    }
  }

  /**
   * Flood per-seed dengan klaim urutan strok: mencatat cakupan region DAN
   * nomor strok terbesar yang mengklaim tiap piksel. Dinding = protect saja
   * agar Remove/Keep saling menimpa (strok terakhir menang), bukan saling
   * memblokir permanen.
   */
  const floodClaim = (
    cov: Uint8Array,
    seqArr: Int32Array,
    walls: Uint8Array,
    sx: number,
    sy: number,
    seq: number
  ) => {
    const startIdx = (sy - by0) * bw + (sx - bx0)
    if (walls[startIdx] || !inside[startIdx]) return
    const o0 = (sy * gw + sx) * 4
    const r0 = wd.data[o0]
    const g0 = wd.data[o0 + 1]
    const b0 = wd.data[o0 + 2]
    const visited = new Uint8Array(inside.length)
    visited[startIdx] = 1
    cov[startIdx] = 1
    if (seq > seqArr[startIdx]) seqArr[startIdx] = seq
    const stack: number[] = [startIdx]
    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (visited[nidx] || walls[nidx] || !inside[nidx]) continue
        const o = (ny * gw + nx) * 4
        const diff = Math.max(
          Math.abs(wd.data[o] - r0),
          Math.abs(wd.data[o + 1] - g0),
          Math.abs(wd.data[o + 2] - b0)
        )
        if (diff > tolR) continue
        visited[nidx] = 1
        cov[nidx] = 1
        if (seq > seqArr[nidx]) seqArr[nidx] = seq
        stack.push(nidx)
      }
    }
  }

  /**
   * Pulau terkurung: piksel inside yang BELUM diklaim dan tidak terhubung
   * ke tepi bbox melalui piksel tak-terklaim = pulau yang sepenuhnya
   * dikelilingi region ini (mis. polkadot di bingkai yang di-keep) →
   * ikut diklaim. Hanya untuk Keep/Protect (alat pelestari desain).
   */
  const claimEnclosed = (cov: Uint8Array, seqArr: Int32Array | null, seq: number) => {
    let any = false
    for (let i = 0; i < cov.length; i++) {
      if (cov[i]) {
        any = true
        break
      }
    }
    if (!any) return
    const outside = new Uint8Array(inside.length)
    const stack: number[] = []
    // Seed komplementer = piksel inside yang bersentuhan dengan luar frame
    // (ring margin bbox TIDAK inside, jadi jangan pakai baris/kolam tepi
    // grid mentah). Dari sinilah "diluar" menjangkau area tak-terklaim.
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || cov[i] || outside[i]) continue
      const gx = bx0 + (i % bw)
      const gy = by0 + Math.floor(i / bw)
      const edge =
        gx - 1 < bx0 ||
        gx + 1 > bx1 ||
        gy - 1 < by0 ||
        gy + 1 > by1 ||
        !inside[i - 1] ||
        !inside[i + 1] ||
        !inside[i - bw] ||
        !inside[i + bw]
      if (edge) {
        outside[i] = 1
        stack.push(i)
      }
    }
    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (outside[nidx] || cov[nidx] || !inside[nidx]) continue
        outside[nidx] = 1
        stack.push(nidx)
      }
    }
    for (let i = 0; i < inside.length; i++) {
      if (inside[i] && !cov[i] && !outside[i]) {
        cov[i] = 1
        if (seqArr && seq > seqArr[i]) seqArr[i] = seq
      }
    }
  }

  // Urutan prioritas: Protect > (Remove vs Keep: STROK TERAKHIR menang,
  // seri → Keep) > Smart Clear. Remove dan Keep bebas diulang bergantian.
  const seedProt = new Uint8Array(inside.length)
  let maxProtSeq = 0
  for (const s of f.protect_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) {
      floodRegion(seedProt, EMPTY, pt[0], pt[1])
      maxProtSeq = Math.max(maxProtSeq, s.s ?? 0)
    }
  }
  // Pulau terkurung dalam region protect ikut dilindungi
  claimEnclosed(seedProt, null, maxProtSeq)
  const protGrid = new Uint8Array(inside.length)
  for (let i = 0; i < protGrid.length; i++) {
    protGrid[i] = prot[i] | seedProt[i] ? 1 : 0
  }

  const remCov = new Uint8Array(inside.length)
  const remSeq = new Int32Array(inside.length)
  let maxRemSeq = 0
  for (const s of f.remove_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) {
      floodClaim(remCov, remSeq, protGrid, pt[0], pt[1], s.s ?? 0)
      maxRemSeq = Math.max(maxRemSeq, s.s ?? 0)
    }
  }
  const keepCov = new Uint8Array(inside.length)
  const keepSeq = new Int32Array(inside.length)
  let maxKeepSeq = 0
  for (const s of f.keep_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) {
      floodClaim(keepCov, keepSeq, protGrid, pt[0], pt[1], s.s ?? 0)
      maxKeepSeq = Math.max(maxKeepSeq, s.s ?? 0)
    }
  }
  // Pulau terkurung dalam region keep ikut dipulihkan (strok keep terbaru)
  claimEnclosed(keepCov, keepSeq, maxKeepSeq)

  // Simetri un-keep: pulau terkurung dalam region remove yang sebelumnya
  // di-KEEP ikut terhapus (strok remove terbaru). Pulau yang tidak pernah
  // di-keep tetap aman — elemen desain di dalam slot tidak ikut terhapus.
  {
    let anyRem = false
    for (let i = 0; i < remCov.length; i++) {
      if (remCov[i]) {
        anyRem = true
        break
      }
    }
    if (anyRem) {
      const outsideR = new Uint8Array(inside.length)
      const stackR: number[] = []
      for (let i = 0; i < inside.length; i++) {
        if (!inside[i] || remCov[i] || outsideR[i]) continue
        const gx = bx0 + (i % bw)
        const gy = by0 + Math.floor(i / bw)
        const edge =
          gx - 1 < bx0 ||
          gx + 1 > bx1 ||
          gy - 1 < by0 ||
          gy + 1 > by1 ||
          !inside[i - 1] ||
          !inside[i + 1] ||
          !inside[i - bw] ||
          !inside[i + bw]
        if (edge) {
          outsideR[i] = 1
          stackR.push(i)
        }
      }
      while (stackR.length > 0) {
        const idx = stackR.pop() as number
        const gx = bx0 + (idx % bw)
        const gy = by0 + Math.floor(idx / bw)
        for (const [ox, oy] of NEIGHBORS) {
          const nx = gx + ox
          const ny = gy + oy
          if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
          const nidx = (ny - by0) * bw + (nx - bx0)
          if (outsideR[nidx] || remCov[nidx] || !inside[nidx]) continue
          outsideR[nidx] = 1
          stackR.push(nidx)
        }
      }
      // Pulau = inside ∧ ¬remCov ∧ ¬outsideR. Klaim hanya yang overlap keep.
      for (let i = 0; i < inside.length; i++) {
        if (!inside[i] || remCov[i] || outsideR[i] || !keepCov[i]) continue
        // BFS satu pulau dari piksel keep ini
        const island: number[] = [i]
        const seen = new Uint8Array(inside.length)
        seen[i] = 1
        for (let qi = 0; qi < island.length; qi++) {
          const idx = island[qi]
          const gx = bx0 + (idx % bw)
          const gy = by0 + Math.floor(idx / bw)
          for (const [ox, oy] of NEIGHBORS) {
            const nx = gx + ox
            const ny = gy + oy
            if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
            const nidx = (ny - by0) * bw + (nx - bx0)
            if (seen[nidx] || !inside[nidx] || remCov[nidx] || outsideR[nidx]) continue
            seen[nidx] = 1
            island.push(nidx)
          }
        }
        for (const idx of island) {
          remCov[idx] = 1
          if (maxRemSeq > remSeq[idx]) remSeq[idx] = maxRemSeq
        }
      }
    }
  }

  // Resolusi konflik per piksel antara region Remove dan Keep.
  const keepGrid = new Uint8Array(inside.length)
  const remWon = new Uint8Array(inside.length)
  for (let i = 0; i < inside.length; i++) {
    const r = remCov[i]
    const k = keepCov[i]
    if (r && k) {
      if (remSeq[i] > keepSeq[i]) remWon[i] = 1
      else keepGrid[i] = 1
    } else if (r) {
      remWon[i] = 1
    } else if (k) {
      keepGrid[i] = 1
    }
  }

  // Guard gabungan: rect protect + region protect + region keep (hasil
  // resolusi) — menghalangi smart clear, absorpsi tepi, Edge Cleanup &
  // Full Clear. TIDAK menghalangi kuas Remove (strok terakhir menang).
  const guard = new Uint8Array(inside.length)
  for (let i = 0; i < guard.length; i++) {
    guard[i] = prot[i] | seedProt[i] | keepGrid[i] ? 1 : 0
  }
  const remAll = Uint8Array.from(rem)
  for (let i = 0; i < remWon.length; i++) {
    if (remWon[i]) remAll[i] = 1
  }

  // Tiga strategi clear:
  // 1. Full Clear (clear_zone >= 100): bolong seluruh frame tanpa syarat.
  // 2. MODE ISI PENUH: bila MAYORITAS area frame satu warna (rasio piksel
  //    mirip warna seed >= FILL_RATIO), bolong seluruh frame sekaligus —
  //    tanpa syarat konektivitas agar noise/gradasi halus tidak memecah
  //    lubang — kecuali piksel yang benar-benar beda warna (elemen) & protect.
  // 3. FRAME RAMAI: hard zone ternoda warna + flood fill ketat.
  const fullClear = f.clear_zone >= 100
  const tolHard = Math.max(tol * 2, 12)
  const tolFill = Math.max(tol * 4, 28)
  const FILL_RATIO = 0.55

  // Diff seluruh piksel inside terhadap warna rata-rata seed
  const diffs = new Uint8Array(inside.length)
  let insideCount = 0
  let sameCount = 0
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    const o = ((by0 + Math.floor(i / bw)) * gw + (bx0 + (i % bw))) * 4
    const diff = Math.min(
      255,
      Math.max(
        Math.abs(wd.data[o] - avgR),
        Math.abs(wd.data[o + 1] - avgG),
        Math.abs(wd.data[o + 2] - avgB)
      )
    )
    diffs[i] = diff
    insideCount++
    if (diff <= tolFill) sameCount++
  }

  const cleared = new Uint8Array(seed.length)
  const holeStrength = new Float32Array(seed.length) // SMART REMOVE v2: soft alpha
  const queue: number[] = []
  let fillMode = false

  if (fullClear) {
    for (let i = 0; i < inside.length; i++) if (inside[i] && !guard[i]) {
      cleared[i] = 1; holeStrength[i] = 1.0
    }
  } else if (insideCount > 0 && sameCount / insideCount >= FILL_RATIO) {
    fillMode = true
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || guard[i]) continue
      if (diffs[i] <= tolFill) { cleared[i] = 1; holeStrength[i] = 1.0 }
    }
  } else {
    for (let i = 0; i < seed.length; i++) {
      if (!seed[i] || guard[i]) continue
      if (diffs[i] <= tolHard) {
        cleared[i] = 1; holeStrength[i] = 1.0
        queue.push(i)
      }
    }
  }

  if (!fillMode) {
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi]
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (cleared[nidx] || !inside[nidx]) continue
        if (guard[nidx]) continue // Protect/Keep menahan automatic clearing
        const ndx = nx + 0.5 - cx
        const ndy = ny + 0.5 - cy
        const dist = Math.sqrt(ndx * ndx + ndy * ndy)
        if (dist > dMax) continue // Clear Expansion habis
        // Edge Protection: makin jauh dari pusat, toleransi makin ketat
        const r = dMax > dHard ? (dist - dHard) / (dMax - dHard) : 0
        const effTol = tol * (1 - 0.85 * ep * r)
        const o = (ny * gw + nx) * 4
        const diff = Math.max(
          Math.abs(wd.data[o] - avgR),
          Math.abs(wd.data[o + 1] - avgG),
          Math.abs(wd.data[o + 2] - avgB)
        )
        if (diff > effTol) continue // elemen desain perifer — pertahankan
        cleared[nidx] = 1
        // Soft alpha ramp: semakin jauh dari pusat, makin transparan
        const distAlpha = dist <= dHard ? 1.0
          : (dMax > dHard ? 1.0 - (dist - dHard) / (dMax - dHard) : 1.0)
        holeStrength[nidx] = Math.max(holeStrength[nidx], distAlpha)
        queue.push(nidx)
      }
    }
  }

  // ── SMART REMOVE v2: Soft Alpha Ramp ─────────────────────────────
  // GRAD_THRESHOLD dinaikkan 0.25→0.55: Sobel tidak terlalu agresif
  // sehingga piksel cleared tidak dapat holeStrength terlalu rendah.
  const GRAD_THRESHOLD = 0.55
  const twoSigSq = 2 * seedStddev * seedStddev

  for (let i = 0; i < cleared.length; i++) {
    if (!cleared[i] || guard[i]) continue
    const gx = bx0 + (i % bw)
    const gy = by0 + Math.floor(i / bw)
    const o = (gy * gw + gx) * 4
    const pr = wd.data[o], pg = wd.data[o + 1], pb = wd.data[o + 2]

    // 1. Color alpha (weighted RGB approx to LAB)
    const dr = pr - avgR, dg = pg - avgG, db = pb - avgB
    const wDist = Math.sqrt((2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9)
    let colorAlpha = Math.exp(-0.5 * wDist * wDist / twoSigSq)
    if (seed[i]) colorAlpha = Math.max(colorAlpha, 0.85) // seed zone floor

    // 2. Dist alpha (linear ramp)
    const ndx = gx + 0.5 - cx, ndy = gy + 0.5 - cy
    const dist = Math.sqrt(ndx * ndx + ndy * ndy)
    const distAlpha = dist <= dHard ? 1.0
      : (dMax > dHard && dist < dMax ? 1.0 - (dist - dHard) / (dMax - dHard) : 1.0)

    // 3. Gradient damping (Sobel) — floor dinaikkan 0.1→0.35
    const gradMag = sobelMagnitude(wd, gx, gy, gw, gh)
    const gradDamping = Math.max(0.35, 1.0 - gradMag / Math.max(0.001, GRAD_THRESHOLD))

    let strength = colorAlpha * distAlpha * gradDamping
    if (fullClear || fillMode) strength = Math.max(strength, 0.85)
    holeStrength[i] = Math.min(1, Math.max(holeStrength[i], strength))
  }

  // Force clear kuas/rect remove — HARUS sebelum anti-fringe & Edge
  // Cleanup. Smart Remove v2: kuas Remove → holeStrength penuh (1.0)
  for (let i = 0; i < remAll.length; i++) {
    if (remAll[i] && !prot[i] && !seedProt[i] && inside[i]) {
      cleared[i] = 1
      holeStrength[i] = 1.0
    }
  }

  // ── SMART REMOVE v2: Aggressive Defringe & Boundary Absorption ──────
  // Menghapus tuntas semua serbuk sisa warna, halo anti-alias, dan
  // fringe yang menempel di pinggir-pinggir frame/elemen desain.
  const D8: ReadonlyArray<readonly [number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]
  for (let pass = 0; pass < 4; pass++) {
    const snap = Uint8Array.from(cleared)
    let changed = 0
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || snap[i] || guard[i]) continue
      const dP = diffs[i] ?? 0

      // Jangan sentuh elemen desain kontras tinggi (misal border hitam pekat)
      if (dP >= 140) continue

      const gx = bx0 + (i % bw)
      const gy = by0 + Math.floor(i / bw)

      let touchClear = false
      for (const [ox, oy] of D8) {
        const nx = gx + ox, ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (snap[nidx]) {
          touchClear = true
          break
        }
      }

      if (touchClear) {
        cleared[i] = 1
        holeStrength[i] = 1.0
        changed++
      }
    }
    if (changed === 0) break
  }

  // Minimum Region Size: buang pulau kecil tanpa seed (tidak relevan di
  // mode isi penuh — lubang memang sengaja satu keseluruhan)
  const minArea = (f.min_region_size / 100) * fw * fh
  if (!fillMode && minArea > 1) {
    dropSmallIslands(cleared, seed, bw, bx0, by0, bx1, by1, minArea)
  }

  // EDGE CLEANUP: dilasi lubang HANYA di boundary mask — menelan garis
  // tipis / halo warna / serpihan desain yang masih menempel di tepi area
  // kamera hasil Smart Clear, tanpa deteksi ulang. Mendukung nilai
  // fraksional (step 0.2 px): pass penuh = floor(N), sisa desimal menjadi
  // pass sebagian berupa kekuatan alpha di ring boundary. Protect Area
  // tidak pernah ter-clear dan area di luar frame tidak tersentuh. Bukan
  // penghalus (itu tugas Feather). Harus identik dengan FrameMaskService.
  const ecRaw = Math.max(0, Math.min(5, f.edge_cleanup))
  const ecFull = Math.floor(ecRaw)
  const ecFrac = ecRaw - ecFull
  const ecStrength = new Float32Array(inside.length)
  if (ecRaw > 0) {
    const D8: ReadonlyArray<readonly [number, number]> = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]
    const dilateEdge = (commit: boolean, weight: number) => {
      const snap = Uint8Array.from(cleared)
      for (let i = 0; i < inside.length; i++) {
        if (!inside[i] || snap[i] || guard[i]) continue
        const gx = bx0 + (i % bw)
        const gy = by0 + Math.floor(i / bw)
        let touch = false
        for (const [ox, oy] of D8) {
          const nx = gx + ox
          const ny = gy + oy
          if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
          if (snap[(ny - by0) * bw + (nx - bx0)]) {
            touch = true
            break
          }
        }
        if (!touch) continue
        if (commit) {
          cleared[i] = 1
        } else if (weight > ecStrength[i]) {
          ecStrength[i] = weight
        }
      }
    }
    for (let pass = 0; pass < ecFull; pass++) dilateEdge(true, 1)
    if (ecFrac > 0) dilateEdge(false, ecFrac)
  }

  // ── SMART REMOVE v2: Despeckle & Morphological Hole Closing ─────────
  fillInternalSpeckles(cleared, holeStrength, guard, inside, diffs, bw, bh, bx0, by0, bx1, by1)

  // ── SMART REMOVE v2: Snap-to-Clean post-pass ───────────────────────
  // Menjamin interior frame bersih total (100% transparan / hole = 1.0),
  // menghapus sisa serbuk lemah (< 0.25) dan mengangkat yang valid (>= 0.4)
  // menjadi 1.0. Transisi lembut tepi diciptakan oleh Gaussian feather.
  for (let i = 0; i < holeStrength.length; i++) {
    if (!cleared[i] || guard[i] || remAll[i]) continue
    const s = holeStrength[i]
    if (s < 0.25) {
      cleared[i] = 0
      holeStrength[i] = 0
    } else if (s >= 0.40) {
      holeStrength[i] = 1.0
    }
  }

  // ── SMART REMOVE v2: holeGrid dari holeStrength (soft alpha) ──────────
  let holeGrid = new Float32Array(bw * bh)
  for (let i = 0; i < cleared.length; i++) {
    if (cleared[i]) holeGrid[i] = holeStrength[i] > 0 ? holeStrength[i] : 1.0
  }
  for (let i = 0; i < ecStrength.length; i++) {
    if (ecStrength[i] > holeGrid[i]) holeGrid[i] = ecStrength[i]
  }
  // Keep / Restore menang atas SEMUA proses: kembalikan desain secara
  // penuh (alpha 0) bahkan setelah feather, agar tepi restore tetap tegas.
  for (let i = 0; i < keepGrid.length; i++) {
    if (keepGrid[i] && !remAll[i]) holeGrid[i] = 0
  }
  // ── SMART REMOVE v2: Gaussian Feather (bukan box blur) ─────────────────
  const fr = Math.round(f.feather * scale)
  if (fr > 0) {
    holeGrid = gaussianBlur(holeGrid, bw, bh, fr)
  }

  // Rasterisasi ke ImageData bbox (ruang kerja)
  const imgData = new ImageData(bw, bh)
  for (let i = 0; i < holeGrid.length; i++) {
    const a = Math.round(255 * Math.min(1, Math.max(0, holeGrid[i])))
    if (a > 0) {
      imgData.data[i * 4 + 3] = a
    }
  }

  // Overlay tint region brush untuk preview editor (bukan bagian dari
  // render final): remove=merah tipis, protect=kuning tipis, keep=hijau.
  // Prioritas tampil: Keep > Protect > Remove.
  const overlay = new ImageData(bw, bh)
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    if (keepGrid[i]) {
      r = 34
      g = 197
      b = 94
      a = 88
    } else if (guard[i]) {
      r = 250
      g = 204
      b = 21
      a = 72
    } else if (remAll[i]) {
      r = 239
      g = 68
      b = 68
      a = 64
    }
    if (a > 0) {
      overlay.data[i * 4] = r
      overlay.data[i * 4 + 1] = g
      overlay.data[i * 4 + 2] = b
      overlay.data[i * 4 + 3] = a
    }
  }

  const inv = 1 / scale
  return {
    bx: Math.floor(bx0 * inv),
    by: Math.floor(by0 * inv),
    bw: Math.max(1, Math.ceil(bw * inv)),
    bh: Math.max(1, Math.ceil(bh * inv)),
    imageData: imgData,
    overlay,
  }
}

function dropSmallIslands(
  cleared: Uint8Array,
  seed: Uint8Array,
  bw: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
  minArea: number
): void {
  const comp = new Int32Array(cleared.length)
  const stack: number[] = []

  for (let start = 0; start < cleared.length; start++) {
    if (!cleared[start] || comp[start]) continue
    const cid = start + 1
    const members: number[] = [start]
    comp[start] = cid
    stack.push(start)

    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (cleared[nidx] && !comp[nidx]) {
          comp[nidx] = cid
          members.push(nidx)
          stack.push(nidx)
        }
      }
    }

    if (members.length >= minArea) continue
    let hasSeed = false
    for (const m of members) {
      if (seed[m]) {
        hasSeed = true
        break
      }
    }
    if (!hasSeed) {
      for (const m of members) cleared[m] = 0
    }
  }
}

// ── SMART REMOVE v2: Sobel magnitude ───────────────────────────────────
/** Hitung magnitude Sobel (0–1) dari ImageData pada piksel (gx, gy). */
function sobelMagnitude(data: ImageData, gx: number, gy: number, w: number, h: number): number {
  const L: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = Math.max(0, Math.min(w - 1, gx + dx))
      const ny = Math.max(0, Math.min(h - 1, gy + dy))
      const o = (ny * w + nx) * 4
      L.push(0.299 * data.data[o] + 0.587 * data.data[o + 1] + 0.114 * data.data[o + 2])
    }
  }
  const Gx = -L[0] + L[2] - 2 * L[3] + 2 * L[5] - L[6] + L[8]
  const Gy = -L[0] - 2 * L[1] - L[2] + L[6] + 2 * L[7] + L[8]
  return Math.min(1, Math.sqrt(Gx * Gx + Gy * Gy) / 1443)
}

// ── SMART REMOVE v2: Gaussian Blur ────────────────────────────────────
/** Kernel Gaussian 1D dinormalisasi (separable). */
function gaussianKernel1D(sigma: number, r: number): number[] {
  const kernel: number[] = []
  let sum = 0
  const twoSigSq = 2 * sigma * sigma
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / twoSigSq)
    kernel.push(v)
    sum += v
  }
  return kernel.map((v) => v / sum)
}

/**
 * Gaussian blur separable dua-pass untuk Float32Array.
 * Lebih natural dari box blur — tidak ada kotak artifact di tepi.
 */
function gaussianBlur(
  grid: Float32Array<ArrayBuffer>,
  w: number,
  h: number,
  r: number
): Float32Array<ArrayBuffer> {
  const sigma = Math.max(0.5, r / 2.5)
  const kernel = gaussianKernel1D(sigma, r)
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)

  // Pass horizontal
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = 0; k < kernel.length; k++) {
        const sx = Math.max(0, Math.min(w - 1, x + k - r))
        sum += grid[base + sx] * kernel[k]
      }
      tmp[base + x] = sum
    }
  }

  // Pass vertikal
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let k = 0; k < kernel.length; k++) {
        const sy = Math.max(0, Math.min(h - 1, y + k - r))
        sum += tmp[sy * w + x] * kernel[k]
      }
      out[y * w + x] = sum
    }
  }
  return out
}

/**
 * Menutup semua bintik/serbuk noise dan pinholes yang terkurung di dalam area clear.
 */
function fillInternalSpeckles(
  cleared: Uint8Array,
  holeStrength: Float32Array,
  guard: Uint8Array,
  inside: Uint8Array,
  diffs: Uint8Array,
  bw: number,
  bh: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number
): void {
  for (let pass = 0; pass < 3; pass++) {
    const snap = Uint8Array.from(cleared)
    let changed = 0
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || snap[i] || guard[i] || diffs[i] >= 120) continue
      const gx = bx0 + (i % bw)
      const gy = by0 + Math.floor(i / bw)

      let clearNeighbors = 0
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (snap[nidx]) clearNeighbors++
      }

      // Dikelilingi minimal 3 tetangga clear -> serbuk/pinhole yang terlewat
      if (clearNeighbors >= 3) {
        cleared[i] = 1
        holeStrength[i] = 1.0
        changed++
      }
    }
    if (changed === 0) break
  }
}


