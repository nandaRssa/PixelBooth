import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Check, RefreshCw, Crop, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { useUpdateTemplate } from '@/hooks/useTemplates'
import { getStorageUrl } from '@/api/client'
import apiClient from '@/api/client'
import type { CameraFrame, FrameConfig, Template } from '@/types'
import { normalizeFrame } from '@/utils/frameMask'

// ==========================================
// Template Calibration Modal
// Visual editor untuk menyesuaikan letak, ukuran,
// bentuk, dan urutan bingkai foto.
// ==========================================

interface TemplateCalibrationModalProps {
  isOpen: boolean
  onClose: () => void
  template: Template | null
  onSaveSuccess: () => void
}

export const TemplateCalibrationModal: React.FC<TemplateCalibrationModalProps> = ({
  isOpen,
  onClose,
  template,
  onSaveSuccess,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [frames, setFrames] = useState<CameraFrame[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)

  // Drag states (Move)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [frameStart, setFrameStart] = useState({ x: 0, y: 0 })

  // Drag states (Resize)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStartSize, setResizeStartSize] = useState({ w: 0, h: 0 })

  const canvasWidth = template?.canvas_width ?? 1080
  const canvasHeight = template?.canvas_height ?? 1920

  useEffect(() => {
    if (isOpen && template) {
      const config = template.frame_configuration
      if (Array.isArray(config)) {
        setFrames(
          config.map((f, idx) => normalizeFrame({ ...f, id: f.id ?? idx + 1, order: f.order ?? idx }))
        )
      } else {
        setFrames([])
      }
      setSelectedIdx(null)
    }
  }, [isOpen, template])

  // Helper scale mask points proportionally when frame box changes
  const updateFrameDimensions = (index: number, updates: { x?: number; y?: number; width?: number; height?: number }) => {
    setFrames((prev) => {
      const next = [...prev]
      const f = next[index]
      if (!f) return prev

      const oldX = f.x
      const oldY = f.y
      const oldW = f.width
      const oldH = f.height

      const newX = updates.x !== undefined ? updates.x : f.x
      const newY = updates.y !== undefined ? updates.y : f.y
      const newW = updates.width !== undefined ? updates.width : f.width
      const newH = updates.height !== undefined ? updates.height : f.height

      // Scale mask points proportionally to align the custom shape SVG mask
      let newMask = f.mask
      if (f.mask && f.mask.length > 0 && (oldW !== newW || oldH !== newH || oldX !== newX || oldY !== newY)) {
        newMask = f.mask.map((p: [number, number]) => {
          const relX = oldW > 0 ? (p[0] - oldX) / oldW : 0
          const relY = oldH > 0 ? (p[1] - oldY) / oldH : 0
          return [
            Math.round(newX + relX * newW),
            Math.round(newY + relY * newH),
          ]
        })
      }

      next[index] = {
        ...f,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
        mask: newMask,
      }
      return next
    })
  }

  // Helper shape selection
  const changeFrameShape = (index: number, shape: string) => {
    setFrames((prev) => {
      const next = [...prev]
      const f = next[index]
      if (!f) return prev

      const newMask = regenerateMaskForShape(shape, f.x, f.y, f.width, f.height)
      next[index] = {
        ...f,
        shape,
        mask: newMask,
      }
      return next
    })
  }

  const regenerateMaskForShape = (shape: string, x: number, y: number, w: number, h: number): [number, number][] => {
    if (shape === 'circle' || shape === 'oval') {
      const cx = x + w / 2
      const cy = y + h / 2
      const rx = w / 2
      const ry = h / 2
      const mask: [number, number][] = []
      const steps = 48
      for (let i = 0; i < steps; i++) {
        const t = (2 * Math.PI * i) / steps
        mask.push([Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))])
      }
      return mask
    }
    if (shape === 'triangle') {
      return [
        [Math.round(x + w / 2), y],
        [x + w, y + h],
        [x, y + h],
      ]
    }
    // Rectangle
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]
  }

  // Drag and drop frame handlers
  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault()
    setSelectedIdx(index)
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    const f = frames[index]
    setFrameStart({ x: f.x, y: f.y })
  }

  const handleResizeMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedIdx(index)
    setIsResizing(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    const f = frames[index]
    setResizeStartSize({ w: f.width, h: f.height })
  }

  // Global mouse move handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container || selectedIdx === null) return
      const scale = canvasWidth / container.clientWidth

      if (isDragging) {
        const f = frames[selectedIdx]
        const dx = (e.clientX - dragStart.x) * scale
        const dy = (e.clientY - dragStart.y) * scale
        const newX = Math.max(0, Math.min(Math.round(frameStart.x + dx), canvasWidth - f.width))
        const newY = Math.max(0, Math.min(Math.round(frameStart.y + dy), canvasHeight - f.height))
        updateFrameDimensions(selectedIdx, { x: newX, y: newY })
      }

      if (isResizing) {
        const f = frames[selectedIdx]
        const dx = (e.clientX - dragStart.x) * scale
        const dy = (e.clientY - dragStart.y) * scale
        const newW = Math.max(40, Math.min(Math.round(resizeStartSize.w + dx), canvasWidth - f.x))
        const newH = Math.max(40, Math.min(Math.round(resizeStartSize.h + dy), canvasHeight - f.y))
        updateFrameDimensions(selectedIdx, { width: newW, height: newH })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isResizing, selectedIdx, frameStart, resizeStartSize, dragStart, frames, canvasWidth, canvasHeight])

  // manual actions
  const handleAddFrame = () => {
    const defaultW = Math.round(canvasWidth * 0.3)
    const defaultH = Math.round(canvasHeight * 0.2)
    const newFrame: CameraFrame = normalizeFrame({
      id: frames.length + 1,
      order: frames.length,
      shape: 'rectangle',
      x: Math.round((canvasWidth - defaultW) / 2),
      y: Math.round((canvasHeight - defaultH) / 2),
      width: defaultW,
      height: defaultH,
      mask: [
        [0, 0],
        [defaultW, 0],
        [defaultW, defaultH],
        [0, defaultH],
      ].map((p) => [
        Math.round(p[0] + (canvasWidth - defaultW) / 2),
        Math.round(p[1] + (canvasHeight - defaultH) / 2),
      ]),
    })
    setFrames((prev) => [...prev, newFrame])
    setSelectedIdx(frames.length)
    toast.info('Bingkai baru ditambahkan.')
  }

  const handleDeleteFrame = (index: number) => {
    setFrames((prev) => prev.filter((_, idx) => idx !== index).map((f, i) => ({ ...f, id: i + 1, order: i })))
    setSelectedIdx(null)
    toast.info('Bingkai dihapus.')
  }

  const handleOrderChange = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === frames.length - 1) return

    const swapIdx = direction === 'up' ? index - 1 : index + 1
    setFrames((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = { ...next[swapIdx], order: index }
      next[swapIdx] = { ...temp, order: swapIdx }
      return next
    })
    setSelectedIdx(swapIdx)
  }

  const handleAutoDetect = async () => {
    if (!template) return
    setIsDetecting(true)
    try {
      const response = await apiClient.post(`/templates/${template.id}/detect-frames`)
      const detected = response.data.data
      if (detected && Array.isArray(detected.frames)) {
        setFrames(
          detected.frames.map((f: any, idx: number) => ({
            id: idx + 1,
            order: idx,
            shape: f.shape ?? 'rectangle',
            x: f.x ?? 100,
            y: f.y ?? 100,
            width: f.width ?? 300,
            height: f.height ?? 300,
            mask: f.mask ?? [],
          }))
        )
        setSelectedIdx(null)
        toast.success(`Deteksi otomatis berhasil: ${detected.frame_count} bingkai ditemukan.`)
      }
    } catch {
      toast.error('Gagal menjalankan deteksi otomatis.')
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSave = async () => {
    if (!template) return
    setIsSaving(true)
    try {
      // Re-order sequentially just to be safe
      const finalConfig = frames.map((f, i) => ({
        ...f,
        id: i + 1,
        order: i,
      }))

      await apiClient.put(`/templates/${template.id}`, {
        frame_configuration: finalConfig,
        frame_count: finalConfig.length,
      })
      toast.success('Kalibrasi template berhasil disimpan.')
      onSaveSuccess()
      onClose()
    } catch {
      toast.error('Gagal menyimpan kalibrasi template.')
    } finally {
      setIsSaving(false)
    }
  }

  // Get points relative to frame box coordinates to draw SVG polygon mask preview
  const relativePoints = (f: FrameConfig) => {
    if (!f.mask || f.mask.length === 0) {
      return `0,0 ${f.width},0 ${f.width},${f.height} 0,${f.height}`
    }
    return f.mask
      .map((p: [number, number]) => {
        const rx = p[0] - f.x
        const ry = p[1] - f.y
        return `${rx},${ry}`
      })
      .join(' ')
  }

  const activeFrame = selectedIdx !== null ? frames[selectedIdx] : null

  return (
    <AnimatePresence>
      {isOpen && template && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-6xl h-[90vh] bg-[#141414] border border-[#2A2A2A] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
              <div>
                <h3 className="text-white font-bold text-base">Kalibrasi Template: {template.name}</h3>
                <p className="text-[#606060] text-xs mt-0.5">
                  Sesuaikan koordinat bingkai, bentuk mask, dan urutan pemotretan.
                </p>
              </div>
              <button onClick={onClose} className="text-[#606060] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Column: Visual Canvas Area */}
              <div className="flex-1 bg-[#090909] flex items-center justify-center p-6 relative overflow-auto">
                {isDetecting && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Spinner size="lg" className="text-white mb-2" />
                    <span className="text-[#A0A0A0] text-sm">Menjalankan Computer Vision Analyzer...</span>
                  </div>
                )}

                <div
                  ref={containerRef}
                  className="relative border border-[#222] bg-[#0E0E0E] shadow-2xl select-none"
                  style={{
                    width: `min(100%, calc(70vh * ${canvasWidth} / ${canvasHeight}))`,
                    aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                    maxHeight: '68vh',
                  }}
                >
                  {/* Base Template Image */}
                  <img
                    src={getStorageUrl(template.template_url) || undefined}
                    alt="Template layout"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                  />

                  {/* Visual Frames Overlay */}
                  {frames.map((f, idx) => {
                    const isSelected = selectedIdx === idx
                    const pctLeft = (f.x / canvasWidth) * 100
                    const pctTop = (f.y / canvasHeight) * 100
                    const pctWidth = (f.width / canvasWidth) * 100
                    const pctHeight = (f.height / canvasHeight) * 100

                    return (
                      <div
                        key={idx}
                        className={`absolute cursor-move transition-shadow ${
                          isSelected
                            ? 'ring-2 ring-green-400 shadow-[0_0_15px_rgba(74,222,128,0.3)] z-10'
                            : 'border border-dashed border-white/40 hover:border-white/80 z-0'
                        }`}
                        style={{
                          left: `${pctLeft}%`,
                          top: `${pctTop}%`,
                          width: `${pctWidth}%`,
                          height: `${pctHeight}%`,
                        }}
                        onMouseDown={(e) => handleMouseDown(e, idx)}
                      >
                        {/* Shape Mask Preview SVG */}
                        <svg
                          className="absolute inset-0 w-full h-full opacity-60 text-green-400"
                          viewBox={`0 0 ${f.width} ${f.height}`}
                          preserveAspectRatio="none"
                        >
                          <polygon
                            points={relativePoints(f)}
                            fill="rgba(74, 222, 128, 0.15)"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>

                        {/* Order badge inside frame */}
                        <div
                          className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow ${
                            isSelected ? 'bg-green-400 text-black' : 'bg-black/60 text-white'
                          }`}
                        >
                          {f.order + 1}
                        </div>

                        {/* Shape Name Badge inside frame */}
                        <div className="absolute bottom-1 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
                          {f.shape}
                        </div>

                        {/* Resize handle bottom-right */}
                        {isSelected && (
                          <div
                            className="absolute bottom-0 right-0 w-4 h-4 bg-green-400 cursor-se-resize flex items-center justify-center rounded-tl shadow"
                            onMouseDown={(e) => handleResizeMouseDown(e, idx)}
                          >
                            <Crop size={8} className="text-black" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Column: Editor Panel */}
              <div className="w-80 border-l border-[#2A2A2A] bg-[#101010] flex flex-col min-h-0 overflow-y-auto">
                <div className="p-5 flex-1 space-y-6">
                  {/* Global Controls */}
                  <div className="space-y-2">
                    <h4 className="text-white text-xs font-semibold uppercase tracking-wider text-[#606060]">
                      Operasi Template
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddFrame}
                        leftIcon={<Plus size={14} />}
                      >
                        Tambah Manual
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAutoDetect}
                        disabled={isDetecting}
                        leftIcon={<RefreshCw size={14} className={isDetecting ? 'animate-spin' : ''} />}
                      >
                        Scan Ulang
                      </Button>
                    </div>
                  </div>

                  {/* Frame List */}
                  <div className="space-y-2">
                    <h4 className="text-white text-xs font-semibold uppercase tracking-wider text-[#606060]">
                      Daftar Bingkai ({frames.length})
                    </h4>
                    {frames.length === 0 ? (
                      <p className="text-[#606060] text-xs italic">Belum ada bingkai yang dikonfigurasi.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {frames.map((f, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedIdx(i)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                              selectedIdx === i
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : 'bg-[#141414] border-[#2A2A2A] text-[#A0A0A0] hover:text-white hover:border-[#333]'
                            }`}
                          >
                            <span>
                              Bingkai {f.order + 1} ({f.shape})
                            </span>
                            <span className="text-[#606060] font-mono text-[10px]">
                              {f.width}x{f.height}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected Frame Editing */}
                  {activeFrame && selectedIdx !== null ? (
                    <div className="space-y-4 pt-4 border-t border-[#2A2A2A]">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white text-sm font-semibold">Edit Bingkai {activeFrame.order + 1}</h4>
                        <button
                          onClick={() => handleDeleteFrame(selectedIdx)}
                          className="text-[#606060] hover:text-red-400 transition-colors"
                          title="Hapus Frame"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Shape Selector */}
                      <div>
                        <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Bentuk Mask</label>
                        <select
                          value={activeFrame.shape ?? 'rectangle'}
                          onChange={(e) => changeFrameShape(selectedIdx, e.target.value)}
                          className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                        >
                          <option value="rectangle">Rectangle (Persegi)</option>
                          <option value="circle">Circle (Lingkaran)</option>
                          <option value="oval">Oval (Elips)</option>
                          <option value="triangle">Triangle (Segitiga)</option>
                          <option value="rounded-rectangle">Rounded Rectangle</option>
                          <option value="polygon">Polygon</option>
                          <option value="custom">Custom (Outline Asli)</option>
                        </select>
                      </div>

                      {/* Manual Dimension Inputs */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[#606060] text-[10px] font-medium mb-1">Posisi X</label>
                          <input
                            type="number"
                            value={activeFrame.x}
                            onChange={(e) => updateFrameDimensions(selectedIdx, { x: Number(e.target.value) })}
                            min={0}
                            max={canvasWidth}
                            className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[#606060] text-[10px] font-medium mb-1">Posisi Y</label>
                          <input
                            type="number"
                            value={activeFrame.y}
                            onChange={(e) => updateFrameDimensions(selectedIdx, { y: Number(e.target.value) })}
                            min={0}
                            max={canvasHeight}
                            className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[#606060] text-[10px] font-medium mb-1">Lebar (W)</label>
                          <input
                            type="number"
                            value={activeFrame.width}
                            onChange={(e) => updateFrameDimensions(selectedIdx, { width: Number(e.target.value) })}
                            min={20}
                            max={canvasWidth}
                            className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[#606060] text-[10px] font-medium mb-1">Tinggi (H)</label>
                          <input
                            type="number"
                            value={activeFrame.height}
                            onChange={(e) => updateFrameDimensions(selectedIdx, { height: Number(e.target.value) })}
                            min={20}
                            max={canvasHeight}
                            className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Order and sorting controls */}
                      <div>
                        <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Urutan Pemotretan</label>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            fullWidth
                            disabled={selectedIdx === 0}
                            onClick={() => handleOrderChange(selectedIdx, 'up')}
                            leftIcon={<ArrowUp size={12} />}
                          >
                            Naikkan
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            fullWidth
                            disabled={selectedIdx === frames.length - 1}
                            onClick={() => handleOrderChange(selectedIdx, 'down')}
                            leftIcon={<ArrowDown size={12} />}
                          >
                            Turunkan
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-44 border border-dashed border-[#222] rounded-xl flex items-center justify-center text-center p-4">
                      <p className="text-[#606060] text-xs">
                        Pilih bingkai pada layar atau daftar di atas untuk mulai mengedit.
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm/Save Footer */}
                <div className="p-5 border-t border-[#2A2A2A] space-y-2">
                  <Button
                    variant="primary"
                    fullWidth
                    loading={isSaving}
                    onClick={handleSave}
                    leftIcon={<Check size={16} />}
                  >
                    Simpan Konfigurasi
                  </Button>
                  <Button variant="ghost" fullWidth onClick={onClose} disabled={isSaving}>
                    Batalkan
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
