import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Lock,
  Plus,
  Shield,
  Eraser,
  MousePointer2,
  Trash2,
  Video,
  VideoOff,
  Eye,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { templateApi, useTemplate, useUpdateTemplate } from '@/hooks/useTemplates'
import { normalizeFrame, computeHoleMask, downscaleTemplate, type WorkTemplate } from '@/utils/frameMask'
import { loadImage } from '@/utils/templateOverlay'
import type { CameraFrame, ClearArea, Template } from '@/types'

// ==========================================
// Template Frame Editor
// Alur wajib: Upload -> Frame Editor -> Fine Tune Remove ->
// Test Camera -> Confirm Template -> Ready.
//
// Kamera frame sepenuhnya MANUAL: move, resize H/V/corner,
// rotation slider kontinu, flip H/V, clear settings per frame.
// Layer render: DESIGN (atas) > CAMERA (bawah) > MASK.
// ==========================================

type EditorMode = 'select' | 'protect' | 'remove'
type DragType = 'move' | 'resize-e' | 'resize-w' | 'resize-n' | 'resize-s'
  | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw' | 'rotate' | 'draw'

interface DragState {
  type: DragType
  frameId: number
  startCanvas: { x: number; y: number }
  startFrame: CameraFrame
  anchor?: { x: number; y: number }
  /** Proyeksi lokal pointer terhadap anchor saat mulai resize (anti-lompat) */
  grabLx?: number
  grabLy?: number
  grabAngle?: number
  drawArea?: 'protect' | 'remove'
}

const MIN_SIZE = 24
const HANDLE_TOL_PX = 12
const ROT_HANDLE_DIST = 34

const DEFAULT_CLEAR = {
  // Default 60 (smart clear): elemen dekorasi yang masuk ke dalam frame
  // otomatis dipertahankan (menimpa kamera). Pakai toggle "Full Clear"
  // untuk slot polos yang ingin dibolongi 1 frame penuh.
  clear_zone: 60,
  clear_expansion: 25,
  region_sensitivity: 50,
  min_region_size: 1,
  edge_protection: 60,
  feather: 2,
}

const TemplateFrameEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const templateId = id ? Number(id) : null

  const templateQuery = useTemplate(templateId)
  const updateTemplate = useUpdateTemplate()

  const template: Template | null = templateQuery.data ?? null

  const [frames, setFrames] = useState<CameraFrame[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<EditorMode>('select')
  const [previewMask, setPreviewMask] = useState(true)
  const [testCamera, setTestCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [drawingRect, setDrawingRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Dual mode penentuan Camera Frame: manual (editor) / auto (deteksi sistem)
  const [frameMode, setFrameMode] = useState<'manual' | 'auto'>('manual')
  const [detecting, setDetecting] = useState(false)
  const manualBackupRef = useRef<CameraFrame[] | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const templateImgRef = useRef<HTMLImageElement | null>(null)
  const workRef = useRef<WorkTemplate | null>(null)
  const holesRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const rafRef = useRef<number | null>(null)
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })

  const selected = useMemo(
    () => frames.find((f) => f.id === selectedId) ?? null,
    [frames, selectedId]
  )

  // ===== Init frames dari template =====
  useEffect(() => {
    if (!template || initialized) return
    const cfg = Array.isArray(template.frame_configuration) ? template.frame_configuration : []
    setFrames(cfg.map(normalizeFrame))
    setInitialized(true)
  }, [template, initialized])

  // ===== Muat gambar template + data kerja =====
  useEffect(() => {
    if (!template?.template_url) return
    let cancelled = false
    loadImage(template.template_url)
      .then((img) => {
        if (cancelled) return
        templateImgRef.current = img
        workRef.current = downscaleTemplate(img, template.canvas_width, template.canvas_height)
        rebuildHoles()
        scheduleRender()
      })
      .catch(() => toast.error('Gagal memuat gambar template.'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.template_url])

  // ===== Rebuild layer desain berlubang saat frame berubah =====
  const rebuildHoles = useCallback(() => {
    const img = templateImgRef.current
    const tpl = template
    if (!img || !tpl) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = tpl.canvas_width
      canvas.height = tpl.canvas_height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const wt = workRef.current ?? downscaleTemplate(img, canvas.width, canvas.height)
      workRef.current = wt

      const tmp = document.createElement('canvas')
      const tmpCtx = tmp.getContext('2d')
      if (!tmpCtx) return

      ctx.globalCompositeOperation = 'destination-out'
      for (const f of frames) {
        const mask = computeHoleMask(wt, f)
        if (!mask) continue
        tmp.width = mask.imageData.width
        tmp.height = mask.imageData.height
        tmpCtx.putImageData(mask.imageData, 0, 0)
        // bx/by/bw/bh sudah dalam koordinat canvas (computeHoleMask yang
        // mengonversi dari ruang kerja) — JANGAN dikonversi lagi.
        ctx.drawImage(tmp, mask.bx, mask.by, mask.bw, mask.bh)
      }
      ctx.globalCompositeOperation = 'source-over'
      holesRef.current = canvas
    } catch {
      // abaikan kegagalan rebuild sementara
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, template])

  useEffect(() => {
    rebuildHoles()
    scheduleRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames])

  // ===== Render utama =====
  const render = useCallback(() => {
    const cv = canvasRef.current
    const container = containerRef.current
    const tpl = template
    if (!cv || !container || !tpl) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr)
      cv.height = Math.round(ch * dpr)
      cv.style.width = `${cw}px`
      cv.style.height = `${ch}px`
    }

    const S = Math.min(cw / tpl.canvas_width, ch / tpl.canvas_height)
    const ox = (cw - tpl.canvas_width * S) / 2
    const oy = (ch - tpl.canvas_height * S) / 2
    viewRef.current = { scale: S, ox, oy }

    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    ctx.fillStyle = '#0D0D0D'
    ctx.fillRect(0, 0, cw, ch)
    ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * ox, dpr * oy)

    // --- Layer kamera / placeholder (DI BAWAH desain) ---
    const video = testCamera ? videoRef.current : null
    const videoReady = video && video.readyState >= 2 && video.videoWidth > 0

    for (const f of frames) {
      const rad = (f.rotation * Math.PI) / 180
      const cx = f.x + f.width / 2
      const cy = f.y + f.height / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rad)
      // Konten frame (video/placeholder) dicerminkan sesuai flip —
      // transform identik dengan render final (rotasi lalu flip lokal)
      ctx.scale(f.flip_h ? -1 : 1, f.flip_v ? -1 : 1)
      ctx.beginPath()
      ctx.rect(-f.width / 2, -f.height / 2, f.width, f.height)
      ctx.clip()

      if (videoReady && video) {
        const vr = video.videoWidth / video.videoHeight
        const fr = f.width / f.height
        let dw: number
        let dh: number
        if (vr > fr) {
          dh = f.height
          dw = f.height * vr
        } else {
          dw = f.width
          dh = f.width / vr
        }
        ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh)
      } else if (previewMask) {
        ctx.fillStyle = '#16202B'
        ctx.fillRect(-f.width / 2, -f.height / 2, f.width, f.height)
        ctx.strokeStyle = 'rgba(120,160,200,0.25)'
        ctx.lineWidth = 2 / S
        const step = Math.max(f.width, f.height) / 8
        for (let d = -Math.max(f.width, f.height); d < Math.max(f.width, f.height); d += step * 2) {
          ctx.beginPath()
          ctx.moveTo(-f.width / 2 + d, -f.height / 2)
          ctx.lineTo(-f.width / 2 + d + f.height, f.height / 2)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // --- Layer desain dengan lubang mask (DI ATAS kamera) ---
    if (holesRef.current) {
      ctx.drawImage(holesRef.current, 0, 0)
    }

    // --- Chrome editor ---
    for (const f of frames) {
      const isSel = f.id === selectedId
      const rad = (f.rotation * Math.PI) / 180
      const cx = f.x + f.width / 2
      const cy = f.y + f.height / 2

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rad)

      ctx.lineWidth = (isSel ? 2 : 1.5) / S
      ctx.setLineDash(isSel ? [] : [6 / S, 4 / S])
      ctx.strokeStyle = isSel ? '#22D3EE' : 'rgba(255,255,255,0.55)'
      ctx.strokeRect(-f.width / 2, -f.height / 2, f.width, f.height)
      ctx.setLineDash([])

      // Area protect/remove frame terpilih (konten → ikut flip)
      if (isSel) {
        ctx.save()
        ctx.scale(f.flip_h ? -1 : 1, f.flip_v ? -1 : 1)
        for (const a of f.protected_areas) {
          ctx.fillStyle = 'rgba(34,197,94,0.18)'
          ctx.strokeStyle = '#22C55E'
          ctx.lineWidth = 1.5 / S
          ctx.setLineDash([4 / S, 3 / S])
          ctx.fillRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h)
          ctx.strokeRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h)
          ctx.setLineDash([])
        }
        for (const a of f.remove_areas) {
          ctx.fillStyle = 'rgba(239,68,68,0.18)'
          ctx.strokeStyle = '#EF4444'
          ctx.lineWidth = 1.5 / S
          ctx.setLineDash([4 / S, 3 / S])
          ctx.fillRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h)
          ctx.strokeRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h)
          ctx.setLineDash([])
        }
ctx.restore()
    }

      // Label Frame N
      ctx.font = `${13 / S}px system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      const label = `Frame ${frames.indexOf(f) + 1}`
      const pad = 4 / S
      const tw = ctx.measureText(label).width
      ctx.fillStyle = isSel ? 'rgba(34,211,238,0.95)' : 'rgba(0,0,0,0.65)'
      ctx.fillRect(-f.width / 2, -f.height / 2 - pad * 3, tw + pad * 2, 16 / S)
      ctx.fillStyle = isSel ? '#083344' : '#FFFFFF'
      ctx.fillText(label, -f.width / 2 + pad, -f.height / 2 - pad)

      // Handles frame terpilih
      if (isSel && mode === 'select') {
        const hs = 9 / S
        ctx.fillStyle = '#FFFFFF'
        ctx.strokeStyle = '#0891B2'
        ctx.lineWidth = 1.5 / S
        for (const [hx, hy] of handlePoints(f)) {
          ctx.beginPath()
          ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs)
          ctx.fill()
          ctx.stroke()
        }
        // Rotation handle
        ctx.beginPath()
        ctx.moveTo(0, -f.height / 2)
        ctx.lineTo(0, -f.height / 2 - ROT_HANDLE_DIST / S)
        ctx.strokeStyle = '#22D3EE'
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, -f.height / 2 - ROT_HANDLE_DIST / S, 7 / S, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }

    // Rect yang sedang digambar
    if (drawingRect && selected) {
      const rad = (selected.rotation * Math.PI) / 180
      const cx = selected.x + selected.width / 2
      const cy = selected.y + selected.height / 2
      const fx = selected.flip_h ? -1 : 1
      const fy = selected.flip_v ? -1 : 1
      const cos = Math.cos(-rad)
      const sin = Math.sin(-rad)
      const toLocal = (px: number, py: number): [number, number] => {
        let dx = px - cx
        let dy = py - cy
        // Pointer → koordinat konten: balikkan flip dulu, lalu rotasi
        dx *= fx
        dy *= fy
        return [dx * cos - dy * sin + selected.width / 2, dx * sin + dy * cos + selected.height / 2]
      }
      const [lx1, ly1] = toLocal(drawingRect.x1, drawingRect.y1)
      const [lx2, ly2] = toLocal(drawingRect.x2, drawingRect.y2)
      const rx = Math.min(lx1, lx2) - selected.width / 2
      const ry = Math.min(ly1, ly2) - selected.height / 2
      const rw = Math.abs(lx2 - lx1)
      const rh = Math.abs(ly2 - ly1)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rad)
      ctx.scale(fx, fy)
      ctx.fillStyle = mode === 'protect' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'
      ctx.strokeStyle = mode === 'protect' ? '#22C55E' : '#EF4444'
      ctx.lineWidth = 1.5 / S
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.restore()
    }
  }, [template, frames, selectedId, mode, previewMask, testCamera, drawingRect, selected])

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      render()
    })
  }, [render])

  useEffect(() => {
    scheduleRender()
  }, [scheduleRender])

  // ===== Test Camera =====
  useEffect(() => {
    if (!testCamera) return
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = document.createElement('video')
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        video.play().catch(() => {})
        videoRef.current = video
        setCameraError(null)
        scheduleRender()
      })
      .catch(() => {
        setTestCamera(false)
        setCameraError('Tidak dapat mengakses kamera. Izinkan akses kamera di browser.')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      videoRef.current = null
    }
  }, [testCamera, scheduleRender])

  // Loop render saat test camera aktif
  useEffect(() => {
    if (!testCamera) return
    let alive = true
    const loop = () => {
      if (!alive) return
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [testCamera, render])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => scheduleRender())
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleRender])

  // ===== Koordinat & hit-test helpers =====
  const toCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { scale, ox, oy } = viewRef.current
    return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale }
  }

  function handlePoints(f: CameraFrame): Array<[number, number]> {
    const hw = f.width / 2
    const hh = f.height / 2
    return [
      [-hw, -hh], [0, -hh], [hw, -hh],
      [-hw, 0], [hw, 0],
      [-hw, hh], [0, hh], [hw, hh],
    ]
  }

  const localPoint = (f: CameraFrame, p: { x: number; y: number }): [number, number] => {
    const rad = (f.rotation * Math.PI) / 180
    const cos = Math.cos(-rad)
    const sin = Math.sin(-rad)
    const dx = p.x - (f.x + f.width / 2)
    const dy = p.y - (f.y + f.height / 2)
    return [dx * cos - dy * sin, dx * sin + dy * cos]
  }

  const hitHandle = (f: CameraFrame, p: { x: number; y: number }): DragType | null => {
    const tol = HANDLE_TOL_PX / viewRef.current.scale
    const cornerTol = Math.max(tol, 10 / viewRef.current.scale) // sudut sedikit lebih besar dari handle
    const [lx, ly] = localPoint(f, p)
    const hw = f.width / 2
    const hh = f.height / 2

    // Rotate handle: di atas tengah tepi atas
    const rotDist = ROT_HANDLE_DIST / viewRef.current.scale
    if (Math.hypot(lx, ly + hh + rotDist) <= tol) return 'rotate'

    // Harus berada di sekitar border frame (± toleransi)
    if (Math.abs(lx) > hw + tol || Math.abs(ly) > hh + tol) return null

    // Prioritas: sudut (persegi kecil di pojok) → tepi (pita tanpa sudut)
    const atCorner =
      (lx <= -hw + cornerTol && ly <= -hh + cornerTol) || // NW
      (lx >= hw - cornerTol && ly <= -hh + cornerTol) ||  // NE
      (lx <= -hw + cornerTol && ly >= hh - cornerTol) ||  // SW
      (lx >= hw - cornerTol && ly >= hh - cornerTol)      // SE

    if (atCorner) {
      const ns = ly < 0 ? 'n' : 's'
      const ew = lx < 0 ? 'w' : 'e'
      return `resize-${ns}${ew}` as DragType
    }

    // Tepi: pita sepanjang sisi TANPA area sudut
    const nearX = hw - Math.abs(lx) <= tol
    const nearY = hh - Math.abs(ly) <= tol
    if (!nearX && !nearY) return null // interior -> bukan handle

    const ns = nearY ? (ly < 0 ? 'n' : 's') : ''
    const ew = nearX ? (lx < 0 ? 'w' : 'e') : ''
    return `resize-${ns}${ew}` as DragType
  }

  const hitFrame = (p: { x: number; y: number }): CameraFrame | null => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i]
      const [lx, ly] = localPoint(f, p)
      if (Math.abs(lx) <= f.width / 2 && Math.abs(ly) <= f.height / 2) return f
    }
    return null
  }

  // ===== Pointer events =====
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!template) return
    // Mode Auto Render: semua interaksi manual dikunci
    if (frameMode === 'auto') return
    // Abaikan pointer tambahan (multi-touch) saat satu gesture sedang berjalan —
    // pointer kedua bisa mengganti jenis drag di tengah jalan dan membuat
    // frame melompat seperti "terbalik".
    if (dragRef.current) return
    const p = toCanvas(e.clientX, e.clientY)
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)

    if ((mode === 'protect' || mode === 'remove') && selected) {
      dragRef.current = {
        type: 'draw',
        frameId: selected.id,
        startCanvas: p,
        startFrame: selected,
        drawArea: mode,
      }
      setDrawingRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }

    if (selected) {
      const ht = hitHandle(selected, p)
      if (ht === 'rotate') {
        const c = { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 }
        dragRef.current = {
          type: 'rotate',
          frameId: selected.id,
          startCanvas: p,
          startFrame: selected,
          grabAngle: Math.atan2(p.y - c.y, p.x - c.x),
        }
        return
      }
      if (ht) {
        const f = selected
        const sx = ht.includes('e') ? 1 : ht.includes('w') ? -1 : 0
        const sy = ht.includes('s') ? 1 : ht.includes('n') ? -1 : 0
        const anchorLocal: [number, number] = [-sx * f.width / 2, -sy * f.height / 2]
        const rad = (f.rotation * Math.PI) / 180
        const c = { x: f.x + f.width / 2, y: f.y + f.height / 2 }
        const anchor = {
          x: c.x + anchorLocal[0] * Math.cos(rad) - anchorLocal[1] * Math.sin(rad),
          y: c.y + anchorLocal[0] * Math.sin(rad) + anchorLocal[1] * Math.cos(rad),
        }
        // Proyeksi lokal pointer terhadap anchor saat mulai drag — dipakai
        // sebagai basis delta agar resize 1:1 tanpa lompatan awal
        const dx0 = p.x - anchor.x
        const dy0 = p.y - anchor.y
        dragRef.current = {
          type: ht,
          frameId: f.id,
          startCanvas: p,
          startFrame: f,
          anchor,
          grabLx: dx0 * Math.cos(-rad) - dy0 * Math.sin(-rad),
          grabLy: dx0 * Math.sin(-rad) + dy0 * Math.cos(-rad),
        }
        return
      }
    }

    const hit = hitFrame(p)
    setSelectedId(hit ? hit.id : null)
    if (hit) {
      dragRef.current = { type: 'move', frameId: hit.id, startCanvas: p, startFrame: hit }
    }
  }

  // Kursor ala software grafis sesuai handle yang di-hover
  const HANDLE_CURSORS: Partial<Record<DragType, string>> = {
    'resize-e': 'ew-resize',
    'resize-w': 'ew-resize',
    'resize-n': 'ns-resize',
    'resize-s': 'ns-resize',
    'resize-ne': 'nesw-resize',
    'resize-sw': 'nesw-resize',
    'resize-nw': 'nwse-resize',
    'resize-se': 'nwse-resize',
    rotate: 'grab',
  }

  const updateCursor = (p: { x: number; y: number }) => {
    const cv = canvasRef.current
    if (!cv) return
    if (frameMode === 'auto') {
      cv.style.cursor = 'not-allowed'
      return
    }
    if (mode !== 'select') {
      cv.style.cursor = 'crosshair'
      return
    }
    let cur = ''
    if (selected) {
      const ht = hitHandle(selected, p)
      if (ht) cur = HANDLE_CURSORS[ht] ?? ''
      else if (hitFrame(p)) cur = 'move'
    }
    cv.style.cursor = cur
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const p = toCanvas(e.clientX, e.clientY)
    if (!drag) {
      updateCursor(p)
      return
    }
    const f0 = drag.startFrame

    if (drag.type === 'draw') {
      setDrawingRect((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : prev))
      return
    }

    if (drag.type === 'move') {
      const dx = p.x - drag.startCanvas.x
      const dy = p.y - drag.startCanvas.y
      updateFrame(f0.id, { x: f0.x + dx, y: f0.y + dy })
      return
    }

    if (drag.type === 'rotate') {
      const c = { x: f0.x + f0.width / 2, y: f0.y + f0.height / 2 }
      let deg = (f0.rotation + ((Math.atan2(p.y - c.y, p.x - c.x) - (drag.grabAngle ?? 0)) * 180) / Math.PI) % 360
      if (deg > 180) deg -= 360
      if (deg < -180) deg += 360
      // Snap halus dekat kelipatan 15° dan 0°
      for (const snap of [-180, -90, 0, 90, 180]) {
        if (Math.abs(deg - snap) < 2) deg = snap
      }
      for (let s = -180; s <= 180; s += 15) {
        if (Math.abs(deg - s) < 1) deg = s
      }
      updateFrame(f0.id, { rotation: Math.round(deg * 10) / 10 })
      return
    }

    // Resize gaya software grafis — berbasis DELTA pointer sejak mulai drag:
    // - Tepi yang ditarik bergeser PERSIS mengikuti pointer (1:1, tanpa lompatan
    //   awal), sisi/sudut berlawanan tetap terkunci di anchor.
    // - Corner: width & height bebas mengikuti arah tarikan.
    const rad = (f0.rotation * Math.PI) / 180
    const cos = Math.cos(-rad)
    const sin = Math.sin(-rad)
    const ax = p.x - (drag.anchor?.x ?? 0)
    const ay = p.y - (drag.anchor?.y ?? 0)
    const lx = ax * cos - ay * sin
    const ly = ax * sin + ay * cos

    const dirX = drag.type.includes('w') ? -1 : drag.type.includes('e') ? 1 : 0
    const dirY = drag.type.includes('n') ? -1 : drag.type.includes('s') ? 1 : 0

    const dlx = lx - (drag.grabLx ?? 0)
    const dly = ly - (drag.grabLy ?? 0)

    const newW = dirX !== 0 ? Math.max(MIN_SIZE, f0.width + dirX * dlx) : f0.width
    const newH = dirY !== 0 ? Math.max(MIN_SIZE, f0.height + dirY * dly) : f0.height

    // Posisi tengah baru agar anchor (sisi/sudut berlawanan) tetap
    const offX = dirX * (newW / 2)
    const offY = dirY * (newH / 2)
    const cr = Math.cos(rad)
    const sr = Math.sin(rad)
    const ncx = (drag.anchor?.x ?? 0) + offX * cr - offY * sr
    const ncy = (drag.anchor?.y ?? 0) + offX * sr + offY * cr

    updateFrame(f0.id, { width: newW, height: newH, x: ncx - newW / 2, y: ncy - newH / 2 })
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null

    if (drag?.type === 'draw' && drawingRect && selected) {
      const r = drawingRect
      const area = rectToLocalArea(selected, r)
      if (area && area.w >= 4 && area.h >= 4) {
        const key = drag.drawArea === 'protect' ? 'protected_areas' : 'remove_areas'
        updateFrame(selected.id, {
          [key]: [...selected[key], area],
        } as Partial<CameraFrame>)
      }
      setDrawingRect(null)
    }
  }

  const rectToLocalArea = (f: CameraFrame, r: { x1: number; y1: number; x2: number; y2: number }): ClearArea | null => {
    const rad = (f.rotation * Math.PI) / 180
    const fx = f.flip_h ? -1 : 1
    const fy = f.flip_v ? -1 : 1
    const cos = Math.cos(-rad)
    const sin = Math.sin(-rad)
    const cx = f.x + f.width / 2
    const cy = f.y + f.height / 2
    const conv = (px: number, py: number): [number, number] => {
      let dx = px - cx
      let dy = py - cy
      // Pointer → koordinat konten: balikkan flip dulu, lalu rotasi
      dx *= fx
      dy *= fy
      return [dx * cos - dy * sin + f.width / 2, dx * sin + dy * cos + f.height / 2]
    }
    const [lx1, ly1] = conv(r.x1, r.y1)
    const [lx2, ly2] = conv(r.x2, r.y2)
    return {
      x: Math.min(lx1, lx2),
      y: Math.min(ly1, ly2),
      w: Math.abs(lx2 - lx1),
      h: Math.abs(ly2 - ly1),
    }
  }

  // ===== Frame ops =====
  const updateFrame = (fid: number, patch: Partial<CameraFrame>) => {
    if (frameMode === 'auto') return
    setFrames((prev) => prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)))
  }

  const addFrame = () => {
    if (!template || frameMode === 'auto') return
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1
    const w = template.canvas_width * 0.45
    const h = template.canvas_height * 0.28
    const offset = frames.length * 24
    const nf = normalizeFrame({
      id: newId,
      order: frames.length,
      x: (template.canvas_width - w) / 2 + offset,
      y: (template.canvas_height - h) / 2 + offset,
      width: w,
      height: h,
      rotation: 0,
      ...DEFAULT_CLEAR,
    })
    setFrames((prev) => [...prev, nf])
    setSelectedId(newId)
    setMode('select')
  }

  const duplicateFrame = () => {
    if (!selected || frameMode === 'auto') return
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1
    const copy = normalizeFrame({
      ...selected,
      id: newId,
      order: frames.length,
      x: selected.x + 24,
      y: selected.y + 24,
      protected_areas: selected.protected_areas.map((a) => ({ ...a })),
      remove_areas: selected.remove_areas.map((a) => ({ ...a })),
    })
    setFrames((prev) => [...prev, copy])
    setSelectedId(newId)
  }

  const deleteFrame = () => {
    if (!selected || frameMode === 'auto') return
    setFrames((prev) => prev.filter((f) => f.id !== selected.id))
    setSelectedId(null)
  }

  // ===== Dual Mode: Manual / Auto Render =====
  const runAutoDetect = async () => {
    if (!template || detecting) return
    setDetecting(true)
    try {
      const detected = await templateApi.detectFrames(template.id)
      setFrames(detected)
      setSelectedId(null)
      if (detected.length === 0) {
        toast.error('Tidak ada area foto yang terdeteksi pada template ini.')
      } else {
        toast.success(`Frames Detected — ${detected.length} bingkai ditemukan.`)
      }
    } catch {
      toast.error('Gagal menjalankan auto detection.')
      setFrameMode('manual')
    } finally {
      setDetecting(false)
    }
  }

  const switchFrameMode = (m: 'manual' | 'auto') => {
    if (m === frameMode || detecting) return
    if (m === 'auto') {
      // Simpan hasil kerja manual agar bisa dipulihkan saat kembali
      manualBackupRef.current = frames
      setFrameMode('auto')
      // Langsung proses deteksi tanpa tombol tambahan
      void runAutoDetect()
    } else {
      setFrameMode('manual')
      // Kembalikan susunan manual terakhir (perbandingan non-destruktif)
      if (manualBackupRef.current) {
        setFrames(manualBackupRef.current)
        setSelectedId(null)
      }
    }
  }

  // ===== Confirm Template =====
  const handleConfirm = async () => {
    if (!template || frames.length === 0) return
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        payload: {
          frame_configuration: frames,
          frame_count: frames.length,
          status: 'active',
        },
      })
      toast.success('Template dikonfirmasi dan siap dipakai.')
      navigate('/templates')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menyimpan konfigurasi template.')
    }
  }

  // ===== Loading / error =====
  if (templateQuery.isLoading || !template) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" className="text-white" />
      </div>
    )
  }

  const numInput = (label: string, value: number, onChange: (v: number) => void) => (
    <div>
      <label className="block text-[#606060] text-[11px] font-medium mb-1">{label}</label>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#404040]"
      />
    </div>
  )

  const slider = (label: string, key: keyof Pick<CameraFrame, 'clear_zone' | 'clear_expansion' | 'region_sensitivity' | 'min_region_size' | 'edge_protection' | 'feather'>, min: number, max: number, step: number, suffix: string) =>
    selected && (
      <div key={key}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[#A0A0A0] text-xs font-medium">{label}</label>
          <span className="text-white text-xs tabular-nums">
            {selected[key]}
            {suffix}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={selected[key]}
          onChange={(e) => updateFrame(selected.id, { [key]: Number(e.target.value) } as Partial<CameraFrame>)}
          className="w-full accent-cyan-400"
        />
      </div>
    )

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/templates')} leftIcon={<ArrowLeft size={16} />}>
            Kembali
          </Button>
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">Frame Editor</h1>
            <p className="text-[#606060] text-xs mt-0.5">{template.name}</p>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">
            Draft — belum siap dipakai
          </span>
        </div>

        {/* ===== Mode Manual / Auto Render ===== */}
        <div className="flex rounded-xl border border-[#2A2A2A] overflow-hidden bg-[#0A0A0A] shrink-0">
          <button
            type="button"
            onClick={() => switchFrameMode('manual')}
            disabled={detecting}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              frameMode === 'manual'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-[#A0A0A0] hover:text-white'
            }`}
          >
            <MousePointer2 size={15} />
            Manual
          </button>
          <div className="w-px bg-[#2A2A2A]" />
          <button
            type="button"
            onClick={() => switchFrameMode('auto')}
            disabled={detecting}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              frameMode === 'auto'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#A0A0A0] hover:text-white'
            }`}
          >
            <Wand2 size={15} />
            Auto Render
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={testCamera ? 'primary' : 'secondary'}
            size="md"
            onClick={() => setTestCamera((v) => !v)}
            leftIcon={testCamera ? <VideoOff size={16} /> : <Video size={16} />}
          >
            {testCamera ? 'Stop Kamera' : 'Test Camera'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            loading={updateTemplate.isPending}
            disabled={frames.length === 0}
            leftIcon={<Check size={16} />}
          >
            Confirm Template
          </Button>
        </div>
      </div>

      {cameraError && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2 shrink-0">
          {cameraError}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ===== Canvas ===== */}
        <div ref={containerRef} className="relative flex-1 bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl overflow-hidden min-h-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none"
            style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {detecting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60">
              <Spinner size="lg" className="text-cyan-400" />
              <p className="text-white text-sm font-medium">Detecting Frames...</p>
            </div>
          )}
          {frameMode === 'auto' && !detecting && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/40 px-3 py-1.5 text-violet-300 text-xs font-medium">
              <Lock size={13} />
              Auto Render aktif — frame dikontrol sistem
            </div>
          )}
          {frames.length === 0 && !detecting && frameMode === 'manual' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Layers size={40} className="text-[#333] mb-3" />
              <p className="text-[#A0A0A0] text-sm mb-4">Belum ada camera frame.</p>
              <div className="pointer-events-auto">
                <Button variant="primary" size="md" onClick={addFrame} leftIcon={<Plus size={16} />}>
                  Tambah Frame
                </Button>
              </div>
            </div>
          )}
          {/* Penanda versi build — untuk memastikan bundle terbaru yang dimuat */}
          <div className="absolute bottom-2 right-3 text-[10px] text-[#555] select-none pointer-events-none">
            editor-v13 · edge-absorb
          </div>
        </div>

        {/* ===== Sidebar ===== */}
        <div className="w-80 shrink-0 overflow-y-auto pr-1 space-y-4">
          {/* Frames */}
          <section className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-semibold">Camera Frames ({frames.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={addFrame}
                disabled={frameMode === 'auto'}
                leftIcon={<Plus size={14} />}
              >
                Add
              </Button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {frames.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(f.id)
                    setMode('select')
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    f.id === selectedId
                      ? 'bg-cyan-500/15 border border-cyan-500/40 text-white'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0] hover:text-white'
                  }`}
                >
                  <span>Frame {i + 1}</span>
                  <span className="text-[11px] text-[#606060] tabular-nums">
                    {Math.round(f.width)}×{Math.round(f.height)}
                    {f.rotation !== 0 ? ` · ${f.rotation}°` : ''}
                    {f.flip_h || f.flip_v ? ' · flipped' : ''}
                  </span>
                </button>
              ))}
              {frames.length === 0 && <p className="text-[#606060] text-xs">Belum ada frame.</p>}
            </div>
            {selected && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={duplicateFrame}
                  disabled={frameMode === 'auto'}
                  leftIcon={<Copy size={14} />}
                >
                  Duplicate
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={deleteFrame}
                  disabled={frameMode === 'auto'}
                  leftIcon={<Trash2 size={14} />}
                >
                  Delete
                </Button>
              </div>
            )}
          </section>

          {/* Transform */}
          {selected && (
            <section className={`bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 ${frameMode === 'auto' ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-white text-sm font-semibold mb-3">Transformasi Frame</h3>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {numInput('X', selected.x, (v) => updateFrame(selected.id, { x: v }))}
                {numInput('Y', selected.y, (v) => updateFrame(selected.id, { y: v }))}
                {numInput('W', selected.width, (v) => updateFrame(selected.id, { width: Math.max(MIN_SIZE, v) }))}
                {numInput('H', selected.height, (v) => updateFrame(selected.id, { height: Math.max(MIN_SIZE, v) }))}
              </div>

              {/* Rotation slider kontinu: tengah = 0° */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0] text-xs font-medium">Rotation / Tilt</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step={0.5}
                      min={-180}
                      max={180}
                      value={selected.rotation}
                      onChange={(e) => {
                        let v = Number(e.target.value)
                        if (Number.isNaN(v)) return
                        v = Math.max(-180, Math.min(180, v))
                        updateFrame(selected.id, { rotation: v })
                      }}
                      className="w-16 bg-[#0A0A0A] border border-[#2A2A2A] rounded-md px-1.5 py-0.5 text-white text-xs text-right tabular-nums focus:outline-none focus:border-[#404040]"
                    />
                    <span className="text-[#606060] text-xs">°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={0.5}
                  value={selected.rotation}
                  onChange={(e) => updateFrame(selected.id, { rotation: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-[#606060] mt-0.5">
                  <span>-180°</span>
                  <span>0°</span>
                  <span>+180°</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateFrame(selected.id, { flip_h: !selected.flip_h })}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    selected.flip_h
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0] hover:text-white'
                  }`}
                >
                  <FlipHorizontal size={14} />
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() => updateFrame(selected.id, { flip_v: !selected.flip_v })}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    selected.flip_v
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0] hover:text-white'
                  }`}
                >
                  <FlipVertical size={14} />
                  Flip V
                </button>
              </div>
            </section>
          )}

          {/* Fine Tune Remove */}
          {selected && (
            <section className={`bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 space-y-3 ${frameMode === 'auto' ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-white text-sm font-semibold">Fine Tune Remove</h3>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#A0A0A0] text-xs font-medium flex items-center gap-1.5">
                  Full Clear
                  <span className="text-[#606060] text-[10px] normal-case">(bolong 1 frame penuh)</span>
                </span>
                <input
                  type="checkbox"
                  checked={selected.clear_zone >= 100}
                  onChange={(e) =>
                    updateFrame(selected.id, { clear_zone: e.target.checked ? 100 : 60 })
                  }
                  className="accent-cyan-400 w-4 h-4"
                />
              </label>
              {slider('Center Clear Priority', 'clear_zone', 5, 100, 1, '%')}
              {slider('Clear Expansion', 'clear_expansion', 0, 200, 5, '%')}
              {slider('Region Sensitivity', 'region_sensitivity', 0, 100, 1, '')}
              {slider('Minimum Region Size', 'min_region_size', 0, 50, 0.5, '%')}
              {slider('Edge Protection', 'edge_protection', 0, 100, 1, '')}
              {slider('Feather', 'feather', 0, 20, 1, 'px')}
            </section>
          )}

          {/* Manual Protect / Remove */}
          {selected && (
            <section className={`bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 ${frameMode === 'auto' ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-white text-sm font-semibold mb-3">Manual Area</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                    mode === 'select'
                      ? 'bg-white/10 border border-white/30 text-white'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0]'
                  }`}
                >
                  <MousePointer2 size={14} />
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => setMode('protect')}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                    mode === 'protect'
                      ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0]'
                  }`}
                >
                  <Shield size={14} />
                  Protect
                </button>
                <button
                  type="button"
                  onClick={() => setMode('remove')}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                    mode === 'remove'
                      ? 'bg-red-500/20 border border-red-500/50 text-red-300'
                      : 'bg-[#0A0A0A] border border-[#2A2A2A] text-[#A0A0A0]'
                  }`}
                >
                  <Eraser size={14} />
                  Remove
                </button>
              </div>
              {mode !== 'select' && (
                <p className="text-[#606060] text-[11px] leading-relaxed mb-2">
                  {mode === 'protect'
                    ? 'Tarik kotak pada frame untuk melindungi desain dari clear.'
                    : 'Tarik kotak pada frame untuk menambah area kamera.'}
                </p>
              )}
              {(selected.protected_areas.length > 0 || selected.remove_areas.length > 0) && (
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() =>
                    updateFrame(selected.id, { protected_areas: [], remove_areas: [] })
                  }
                >
                  Reset Semua Area Manual
                </Button>
              )}
            </section>
          )}

          {/* Preview */}
          <section className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[#A0A0A0] text-xs font-medium flex items-center gap-1.5">
                <Eye size={14} />
                Preview Mask Real-time
              </span>
              <input
                type="checkbox"
                checked={previewMask}
                onChange={(e) => setPreviewMask(e.target.checked)}
                className="accent-cyan-400 w-4 h-4"
              />
            </label>
            <p className="text-[#606060] text-[11px] mt-2 leading-relaxed">
              Desain selalu berada DI ATAS kamera. Elemen desain di luar Hard Clear Zone otomatis
              dipertahankan — kamera di-mask di bawahnya.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default TemplateFrameEditorPage
