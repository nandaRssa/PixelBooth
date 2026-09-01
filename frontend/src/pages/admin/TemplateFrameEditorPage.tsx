import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Plus,
  Shield,
  Eraser,
  MousePointer2,
  Trash2,
  Undo2,
  Redo2,
  Video,
  VideoOff,
  Eye,
  Wand2,
  Square,
  Circle,
  Spline,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import {
  templateApi,
  useTemplate,
  useUpdateTemplate,
} from "@/hooks/useTemplates";
import { createCameraStream } from "@/utils/cameraManager";
import {
  normalizeFrame,
  computeHoleMask,
  downscaleTemplate,
  generateDefaultPolygon,
  type WorkTemplate,
} from "@/utils/frameMask";
import { detectFramesFromImage } from "@/utils/clientFrameDetector";
import { loadImage } from "@/utils/templateOverlay";
import { getStorageUrl } from "@/api/client";
import type { CameraFrame, Template } from "@/types";

// ==========================================
// Template Frame Editor
// Alur wajib: Upload -> Frame Editor -> Fine Tune Remove ->
// Test Camera -> Confirm Template -> Ready.
//
// Kamera frame sepenuhnya MANUAL: move, resize H/V/corner,
// rotation slider kontinu, flip H/V, shape (rect/ellipse/poly), clear settings per frame.
// Layer render: DESIGN (atas) > CAMERA (bawah) > MASK.
// ==========================================

type EditorMode = "select" | "protect" | "remove" | "restore";
type BrushKey = "remove_seeds" | "protect_seeds" | "keep_seeds";
type DragType =
  | "move"
  | "resize-e"
  | "resize-w"
  | "resize-n"
  | "resize-s"
  | "resize-ne"
  | "resize-nw"
  | "resize-se"
  | "resize-sw"
  | "rotate"
  | "poly-vertex"
  | "brush";

interface DragState {
  type: DragType;
  frameId: number;
  startCanvas: { x: number; y: number };
  startFrame: CameraFrame;
  anchor?: { x: number; y: number };
  grabLx?: number;
  grabLy?: number;
  grabAngle?: number;
  brushKey?: BrushKey;
  vertexIndex?: number;
}

const MIN_SIZE = 24;
const HANDLE_TOL_PX = 12;
const ROT_HANDLE_DIST = 34;

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
  edge_cleanup: 0,
};

const TemplateFrameEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const templateId = id ? Number(id) : null;

  const templateQuery = useTemplate(templateId);
  const updateTemplate = useUpdateTemplate();

  const template: Template | null = templateQuery.data ?? null;

  const [frames, setFrames] = useState<CameraFrame[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [previewMask, setPreviewMask] = useState(true);
  const [testCamera, setTestCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  // Dual mode penentuan Camera Frame: manual (editor) / auto (deteksi sistem)
  const [frameMode, setFrameMode] = useState<"manual" | "auto">("manual");
  const [detecting, setDetecting] = useState(false);
  const manualBackupRef = useRef<CameraFrame[] | null>(null);
  // Brush region: ukuran kuas (px layar) + posisi kursor untuk lingkaran preview
  const [brushSize, setBrushSize] = useState(28);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastSeedRef = useRef<{ x: number; y: number } | null>(null);
  // Nomor urut strok global: menentukan pemenang konflik Remove vs Keep
  // (strok terakhir menang — bisa saling menimpa berulang kali).
  const strokeSeqRef = useRef(0);
  // Lanjutkan nomor strok dari seed tersimpan agar strok baru SELALU lebih
  // baru daripada strok sesi sebelumnya (jika tidak, keep/remove lama bisa
  // menang karena nomornya lebih tinggi).
  useEffect(() => {
    let mx = 0;
    for (const f of frames) {
      for (const s of f.remove_seeds) mx = Math.max(mx, s.s ?? 0);
      for (const s of f.protect_seeds) mx = Math.max(mx, s.s ?? 0);
      for (const s of f.keep_seeds) mx = Math.max(mx, s.s ?? 0);
    }
    if (mx >= strokeSeqRef.current) strokeSeqRef.current = mx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templateImgRef = useRef<HTMLImageElement | null>(null);
  const workRef = useRef<WorkTemplate | null>(null);
  const holesRef = useRef<HTMLCanvasElement | null>(null);
  const regionRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 });

  const framesRef = useRef<CameraFrame[]>(frames);
  const templateRef = useRef<Template | null>(template);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    templateRef.current = template;
  }, [template]);

  const selected = useMemo(
    () => frames.find((f) => f.id === selectedId) ?? null,
    [frames, selectedId],
  );

  // ===== Rebuild layer desain berlubang saat frame berubah =====
  const rebuildHoles = useCallback(() => {
    const img = templateImgRef.current;
    const tpl = templateRef.current;
    const currentFrames = framesRef.current;
    if (!img || !tpl) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = tpl.canvas_width;
      canvas.height = tpl.canvas_height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let wt = workRef.current;
      if (!wt) {
        try {
          wt = downscaleTemplate(img, canvas.width, canvas.height);
          workRef.current = wt;
        } catch {
          wt = null;
        }
      }

      const tmp = document.createElement("canvas");
      const tmpCtx = tmp.getContext("2d");

      // Kanvas overlay tint region brush (di atas layer desain)
      const region = document.createElement("canvas");
      region.width = canvas.width;
      region.height = canvas.height;
      const regionCtx = region.getContext("2d");

      ctx.globalCompositeOperation = "destination-out";
      for (const f of currentFrames) {
        let mask = null;
        if (wt) {
          try {
            mask = computeHoleMask(wt, f);
          } catch {
            mask = null;
          }
        }

        if (mask && tmpCtx && regionCtx) {
          tmp.width = mask.imageData.width;
          tmp.height = mask.imageData.height;
          tmpCtx.putImageData(mask.imageData, 0, 0);
          ctx.drawImage(tmp, mask.bx, mask.by, mask.bw, mask.bh);
          tmpCtx.putImageData(mask.overlay, 0, 0);
          regionCtx.drawImage(tmp, mask.bx, mask.by, mask.bw, mask.bh);
        } else {
          // Fallback geometric cut jika smart remove belum siap/gagal di browser mobile
          const rad = (f.rotation * Math.PI) / 180;
          const cx = f.x + f.width / 2;
          const cy = f.y + f.height / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rad);
          ctx.fillStyle = "rgba(0, 0, 0, 1)";
          ctx.fillRect(-f.width / 2, -f.height / 2, f.width, f.height);
          ctx.restore();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      holesRef.current = canvas;
      regionRef.current = regionCtx ? region : null;
    } catch {
      // abaikan kegagalan rebuild sementara
    }
  }, []);

  // ===== Render utama =====
  const render = useCallback(() => {
    const cv = canvasRef.current;
    const container = containerRef.current;
    const tpl = template;
    if (!cv || !container || !tpl) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (
      cv.width !== Math.round(cw * dpr) ||
      cv.height !== Math.round(ch * dpr)
    ) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
      cv.style.width = `${cw}px`;
      cv.style.height = `${ch}px`;
    }

    const S = Math.min(cw / tpl.canvas_width, ch / tpl.canvas_height);
    const ox = (cw - tpl.canvas_width * S) / 2;
    const oy = (ch - tpl.canvas_height * S) / 2;
    viewRef.current = { scale: S, ox, oy };

    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!testCamera) {
      ctx.fillStyle = "#0D0D0D";
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * ox, dpr * oy);

    // --- Layer kamera / placeholder (DI BAWAH desain) ---
    const video = testCamera ? videoRef.current : null;
    const videoReady = video && (video.videoWidth > 0 || video.readyState >= 1) && !video.paused;

    for (const f of frames) {
      const rad = (f.rotation * Math.PI) / 180;
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.scale(f.flip_h ? -1 : 1, f.flip_v ? -1 : 1);
      
      // Path bentuk frame (rectangle, ellipse, atau custom polygon)
      ctx.beginPath();
      if (f.shape === "ellipse") {
        ctx.ellipse(0, 0, f.width / 2, f.height / 2, 0, 0, Math.PI * 2);
      } else if (f.shape === "polygon" && Array.isArray(f.polygon_points) && f.polygon_points.length >= 3) {
        const pts = f.polygon_points;
        ctx.moveTo(pts[0].x - f.width / 2, pts[0].y - f.height / 2);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x - f.width / 2, pts[i].y - f.height / 2);
        }
        ctx.closePath();
      } else {
        ctx.rect(-f.width / 2, -f.height / 2, f.width, f.height);
      }
      ctx.clip();

      if (videoReady && video) {
        const vr = video.videoWidth / video.videoHeight;
        const fr = f.width / f.height;
        let dw: number;
        let dh: number;
        if (vr > fr) {
          dh = f.height;
          dw = f.height * vr;
        } else {
          dw = f.width;
          dh = f.width / vr;
        }
        ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
      } else if (previewMask) {
        // Lapisan visual frame kamera (High Contrast Neon & Deep Charcoal)
        ctx.fillStyle = "rgba(10, 15, 29, 0.95)";
        ctx.fillRect(-f.width / 2, -f.height / 2, f.width, f.height);

        // Kisi-kisi garis diagonal oranye kontras tinggi
        ctx.strokeStyle = "rgba(255, 90, 54, 0.4)";
        ctx.lineWidth = 2 / S;
        const step = Math.max(f.width, f.height) / 8;
        for (
          let d = -Math.max(f.width, f.height);
          d < Math.max(f.width, f.height);
          d += step * 2
        ) {
          ctx.beginPath();
          ctx.moveTo(-f.width / 2 + d, -f.height / 2);
          ctx.lineTo(-f.width / 2 + d + f.height, f.height / 2);
          ctx.stroke();
        }

        // Viewfinder 4 Corner Brackets (Siku Sudut Oranye Terang)
        if (f.shape !== "ellipse" && f.shape !== "polygon") {
          const cornerLen = Math.min(24 / S, f.width / 4, f.height / 4);
          ctx.strokeStyle = "#FF5A36";
          ctx.lineWidth = 3.5 / S;
          // Top-left
          ctx.beginPath();
          ctx.moveTo(-f.width / 2, -f.height / 2 + cornerLen);
          ctx.lineTo(-f.width / 2, -f.height / 2);
          ctx.lineTo(-f.width / 2 + cornerLen, -f.height / 2);
          ctx.stroke();
          // Top-right
          ctx.beginPath();
          ctx.moveTo(f.width / 2 - cornerLen, -f.height / 2);
          ctx.lineTo(f.width / 2, -f.height / 2);
          ctx.lineTo(f.width / 2, -f.height / 2 + cornerLen);
          ctx.stroke();
          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(-f.width / 2, f.height / 2 - cornerLen);
          ctx.lineTo(-f.width / 2, f.height / 2);
          ctx.lineTo(-f.width / 2 + cornerLen, f.height / 2);
          ctx.stroke();
          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(f.width / 2 - cornerLen, f.height / 2);
          ctx.lineTo(f.width / 2, f.height / 2);
          ctx.lineTo(f.width / 2, f.height / 2 - cornerLen);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // --- Layer desain dengan lubang mask (DI ATAS kamera) ---
    if (holesRef.current) {
      ctx.drawImage(holesRef.current, 0, 0);
    } else if (templateImgRef.current) {
      ctx.drawImage(templateImgRef.current, 0, 0, tpl.canvas_width, tpl.canvas_height);
    }

    // --- Tint region brush (remove merah / protect kuning / keep hijau) ---
    if (regionRef.current && mode !== "select") {
      ctx.drawImage(regionRef.current, 0, 0);
    }

    // --- Chrome editor (Border, Fill Kontras Tinggi, & Handles) ---
    for (const f of frames) {
      const isSel = f.id === selectedId;
      const rad = (f.rotation * Math.PI) / 180;
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);

      // Path bentuk lokal frame
      const traceShape = () => {
        ctx.beginPath();
        if (f.shape === "ellipse") {
          ctx.ellipse(0, 0, f.width / 2, f.height / 2, 0, 0, Math.PI * 2);
        } else if (f.shape === "polygon" && Array.isArray(f.polygon_points) && f.polygon_points.length >= 3) {
          const pts = f.polygon_points;
          ctx.moveTo(pts[0].x - f.width / 2, pts[0].y - f.height / 2);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x - f.width / 2, pts[i].y - f.height / 2);
          }
          ctx.closePath();
        } else {
          ctx.rect(-f.width / 2, -f.height / 2, f.width, f.height);
        }
      };

      // 1. ISIAN WARNA FRAME KONTRAS TINGGI DI ATAS DESAIN (selalu terlihat jelas di HP/iPhone)
      if (!testCamera) {
        if (isSel) {
          if (mode === "remove") {
            ctx.fillStyle = "rgba(239, 68, 68, 0.40)";
          } else if (mode === "protect") {
            ctx.fillStyle = "rgba(245, 158, 11, 0.40)";
          } else if (mode === "restore") {
            ctx.fillStyle = "rgba(16, 185, 129, 0.40)";
          } else {
            ctx.fillStyle = "rgba(255, 90, 54, 0.35)";
          }
        } else {
          ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
        }
        traceShape();
        ctx.fill();
      }

      // 2. Border frame
      ctx.lineWidth = (isSel ? 3.5 : 2.5) / S;
      ctx.setLineDash(isSel ? [] : [8 / S, 5 / S]);
      ctx.strokeStyle = isSel ? "#FF5A36" : "#10B981";
      traceShape();
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Siku Sudut Kontras Tinggi (untuk persegi)
      if (f.shape !== "ellipse" && f.shape !== "polygon") {
        const cornerLen = Math.min(22 / S, f.width / 4, f.height / 4);
        ctx.strokeStyle = isSel ? "#FFFFFF" : "#10B981";
        ctx.lineWidth = (isSel ? 3.5 : 2.5) / S;
        ctx.beginPath();
        ctx.moveTo(-f.width / 2, -f.height / 2 + cornerLen);
        ctx.lineTo(-f.width / 2, -f.height / 2);
        ctx.lineTo(-f.width / 2 + cornerLen, -f.height / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(f.width / 2 - cornerLen, -f.height / 2);
        ctx.lineTo(f.width / 2, -f.height / 2);
        ctx.lineTo(f.width / 2, -f.height / 2 + cornerLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-f.width / 2, f.height / 2 - cornerLen);
        ctx.lineTo(-f.width / 2, f.height / 2);
        ctx.lineTo(-f.width / 2 + cornerLen, f.height / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(f.width / 2 - cornerLen, f.height / 2);
        ctx.lineTo(f.width / 2, f.height / 2);
        ctx.lineTo(f.width / 2, f.height / 2 - cornerLen);
        ctx.stroke();
      }

      // 4. Titik-titik Vertex Poligon Fleksibel & Tombol Tambah Titik [+]
      if (isSel && f.shape === "polygon" && Array.isArray(f.polygon_points) && f.polygon_points.length >= 3 && mode === "select") {
        const pts = f.polygon_points;
        // Titik-titik Sudut Vertex (Orange Pill/Circle)
        for (let i = 0; i < pts.length; i++) {
          const vx = pts[i].x - f.width / 2;
          const vy = pts[i].y - f.height / 2;
          const vr = 8 / S;
          ctx.beginPath();
          ctx.arc(vx, vy, vr, 0, Math.PI * 2);
          ctx.fillStyle = "#FF5A36";
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 2.5 / S;
          ctx.stroke();

          // Angka titik
          ctx.font = `bold ${9 / S}px system-ui, sans-serif`;
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${i + 1}`, vx, vy);
        }

        // Titik Tambah Titik [+] di tengah setiap segmen garis
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          const mx = (p1.x + p2.x) / 2 - f.width / 2;
          const my = (p1.y + p2.y) / 2 - f.height / 2;
          const mr = 6.5 / S;
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fillStyle = "#06B6D4"; // Cyan terang
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 2 / S;
          ctx.stroke();

          ctx.font = `bold ${10 / S}px system-ui, sans-serif`;
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+", mx, my);
        }
      }

      // Area protect/remove frame terpilih
      if (isSel) {
        ctx.save();
        ctx.scale(f.flip_h ? -1 : 1, f.flip_v ? -1 : 1);
        for (const a of f.protected_areas) {
          ctx.fillStyle = "rgba(34,197,94,0.30)";
          ctx.strokeStyle = "#22C55E";
          ctx.lineWidth = 2 / S;
          ctx.setLineDash([4 / S, 3 / S]);
          ctx.fillRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h);
          ctx.strokeRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h);
          ctx.setLineDash([]);
        }
        for (const a of f.remove_areas) {
          ctx.fillStyle = "rgba(239,68,68,0.30)";
          ctx.strokeStyle = "#EF4444";
          ctx.lineWidth = 2 / S;
          ctx.setLineDash([4 / S, 3 / S]);
          ctx.fillRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h);
          ctx.strokeRect(a.x - f.width / 2, a.y - f.height / 2, a.w, a.h);
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // Label Badge Frame N
      ctx.font = `bold ${12 / S}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const label = `Frame ${frames.indexOf(f) + 1}${isSel ? " (Aktif)" : ""}`;
      const pad = 5 / S;
      const tw = ctx.measureText(label).width;
      
      ctx.fillStyle = isSel ? "#FF5A36" : "rgba(16, 185, 129, 0.95)";
      ctx.beginPath();
      ctx.roundRect(-f.width / 2, -f.height / 2 - pad * 3 - 2 / S, tw + pad * 2, 18 / S, 4 / S);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.5 / S;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, -f.width / 2 + pad, -f.height / 2 - pad);

      // Handles frame terpilih
      if (isSel && mode === "select") {
        const hs = 10 / S;
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#FF5A36";
        ctx.lineWidth = 2 / S;
        for (const [hx, hy] of handlePoints(f)) {
          ctx.beginPath();
          ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.fill();
          ctx.stroke();
        }
        // Rotation handle
        ctx.beginPath();
        ctx.moveTo(0, -f.height / 2);
        ctx.lineTo(0, -f.height / 2 - ROT_HANDLE_DIST / S);
        ctx.strokeStyle = "#FF5A36";
        ctx.lineWidth = 2 / S;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -f.height / 2 - ROT_HANDLE_DIST / S, 8 / S, 0, Math.PI * 2);
        ctx.fillStyle = "#FF5A36";
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2 / S;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (mode !== "select" && cursorRef.current) {
      const cur = cursorRef.current;
      const color =
        mode === "remove"
          ? "#EF4444"
          : mode === "protect"
            ? "#FACC15"
            : "#22C55E";
      ctx.save();
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, brushSize / 2 / S, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / S;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [
    template,
    frames,
    selectedId,
    mode,
    previewMask,
    testCamera,
    brushSize,
  ]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  }, [render]);

  // ===== Init frames dari template =====
  useEffect(() => {
    if (!template || initialized) return;
    const cfg = Array.isArray(template.frame_configuration)
      ? template.frame_configuration
      : [];
    const normalized = cfg.map(normalizeFrame);
    framesRef.current = normalized;
    setFrames(normalized);
    setInitialized(true);
    rebuildHoles();
    scheduleRender();
  }, [template, initialized, rebuildHoles, scheduleRender]);

  // ===== Muat gambar template + data kerja =====
  const templateUrl = template?.template_url || template?.preview_url || template?.template_file;

  useEffect(() => {
    if (!templateUrl || !template) return;
    let cancelled = false;
    loadImage(templateUrl)
      .then((img) => {
        if (cancelled) return;
        templateImgRef.current = img;
        try {
          workRef.current = downscaleTemplate(
            img,
            template.canvas_width,
            template.canvas_height,
          );
        } catch {
          workRef.current = null;
        }
        rebuildHoles();
        scheduleRender();
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Gagal memuat gambar template.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [templateUrl, template?.canvas_width, template?.canvas_height, rebuildHoles, scheduleRender]);

  useEffect(() => {
    rebuildHoles();
    scheduleRender();
  }, [frames, rebuildHoles, scheduleRender]);

  useEffect(() => {
    scheduleRender();
  }, [scheduleRender]);

  // ===== Test Camera =====
  useEffect(() => {
    if (!testCamera) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      scheduleRender();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        let stream: MediaStream;
        try {
          const res = await createCameraStream();
          stream = res.stream;
        } catch {
          // Fallback ke kamera default jika facingMode/resolusi gagal
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          video.onloadedmetadata = () => {
            video.play().catch(() => {});
            scheduleRender();
          };
          video.onplaying = () => {
            scheduleRender();
          };
          await video.play().catch(() => {});
        }
        setCameraError(null);
        scheduleRender();
      } catch (err: unknown) {
        if (cancelled) return;
        setTestCamera(false);
        setCameraError(
          "Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan di browser.",
        );
        toast.error("Tidak dapat mengakses kamera. Periksa izin kamera browser.");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [testCamera, scheduleRender]);

  // Loop render saat test camera aktif
  useEffect(() => {
    if (!testCamera) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [testCamera, render]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleRender]);

  // ===== Koordinat & hit-test helpers =====
  const toCanvas = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, ox, oy } = viewRef.current;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  };

  function handlePoints(f: CameraFrame): Array<[number, number]> {
    const hw = f.width / 2;
    const hh = f.height / 2;
    return [
      [-hw, -hh],
      [0, -hh],
      [hw, -hh],
      [-hw, 0],
      [hw, 0],
      [-hw, hh],
      [0, hh],
      [hw, hh],
    ];
  }

  const localPoint = (
    f: CameraFrame,
    p: { x: number; y: number },
  ): [number, number] => {
    const rad = (f.rotation * Math.PI) / 180;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    const dx = p.x - (f.x + f.width / 2);
    const dy = p.y - (f.y + f.height / 2);
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  };

  const hitPolyVertex = (
    f: CameraFrame,
    p: { x: number; y: number },
  ): number | null => {
    if (f.shape !== "polygon" || !Array.isArray(f.polygon_points)) return null;
    const [lx, ly] = localPoint(f, p);
    const tol = 16 / viewRef.current.scale;
    for (let i = 0; i < f.polygon_points.length; i++) {
      const vx = f.polygon_points[i].x - f.width / 2;
      const vy = f.polygon_points[i].y - f.height / 2;
      if (Math.hypot(lx - vx, ly - vy) <= tol) return i;
    }
    return null;
  };

  const hitPolyAddPoint = (
    f: CameraFrame,
    p: { x: number; y: number },
  ): number | null => {
    if (f.shape !== "polygon" || !Array.isArray(f.polygon_points)) return null;
    const [lx, ly] = localPoint(f, p);
    const tol = 14 / viewRef.current.scale;
    const pts = f.polygon_points;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const mx = (p1.x + p2.x) / 2 - f.width / 2;
      const my = (p1.y + p2.y) / 2 - f.height / 2;
      if (Math.hypot(lx - mx, ly - my) <= tol) return i;
    }
    return null;
  };

  const hitHandle = (
    f: CameraFrame,
    p: { x: number; y: number },
  ): DragType | null => {
    const tol = HANDLE_TOL_PX / viewRef.current.scale;
    const cornerTol = Math.max(tol, 10 / viewRef.current.scale);
    const [lx, ly] = localPoint(f, p);
    const hw = f.width / 2;
    const hh = f.height / 2;

    // Rotate handle
    const rotDist = ROT_HANDLE_DIST / viewRef.current.scale;
    if (Math.hypot(lx, ly + hh + rotDist) <= tol) return "rotate";

    // Harus berada di sekitar border frame
    if (Math.abs(lx) > hw + tol || Math.abs(ly) > hh + tol) return null;

    const atCorner =
      (lx <= -hw + cornerTol && ly <= -hh + cornerTol) ||
      (lx >= hw - cornerTol && ly <= -hh + cornerTol) ||
      (lx <= -hw + cornerTol && ly >= hh - cornerTol) ||
      (lx >= hw - cornerTol && ly >= hh - cornerTol);

    if (atCorner) {
      const ns = ly < 0 ? "n" : "s";
      const ew = lx < 0 ? "w" : "e";
      return `resize-${ns}${ew}` as DragType;
    }

    const nearX = hw - Math.abs(lx) <= tol;
    const nearY = hh - Math.abs(ly) <= tol;
    if (!nearX && !nearY) return null;

    const ns = nearY ? (ly < 0 ? "n" : "s") : "";
    const ew = nearX ? (lx < 0 ? "w" : "e") : "";
    return `resize-${ns}${ew}` as DragType;
  };

  const hitFrame = (p: { x: number; y: number }): CameraFrame | null => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      const [lx, ly] = localPoint(f, p);
      if (f.shape === "ellipse") {
        const rx = f.width / 2;
        const ry = f.height / 2;
        if ((lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1) return f;
      } else if (f.shape === "polygon" && Array.isArray(f.polygon_points) && f.polygon_points.length >= 3) {
        const pts = f.polygon_points;
        const localPoly = pts.map((pt) => ({ x: pt.x - f.width / 2, y: pt.y - f.height / 2 }));
        let inPoly = false;
        for (let a = 0, b = localPoly.length - 1; a < localPoly.length; b = a++) {
          const xi = localPoly[a].x, yi = localPoly[a].y;
          const xj = localPoly[b].x, yj = localPoly[b].y;
          const intersect = yi > ly !== yj > ly && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi;
          if (intersect) inPoly = !inPoly;
        }
        if (inPoly) return f;
      } else {
        if (Math.abs(lx) <= f.width / 2 && Math.abs(ly) <= f.height / 2) return f;
      }
    }
    return null;
  };

  // ===== Pointer events =====
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!template) return;
    if (dragRef.current) return;
    const p = toCanvas(e.clientX, e.clientY);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    if (mode === "protect" || mode === "remove" || mode === "restore") {
      const f = selected ?? hitFrame(p);
      if (!f) return;
      if (!selected || selected.id !== f.id) setSelectedId(f.id);
      const key: BrushKey =
        mode === "remove"
          ? "remove_seeds"
          : mode === "protect"
            ? "protect_seeds"
            : "keep_seeds";
      if (e.altKey || e.button === 2) {
        eraseSeeds(f, key, p);
        return;
      }
      strokeSeqRef.current += 1;
      dragRef.current = {
        type: "brush",
        frameId: f.id,
        startCanvas: p,
        startFrame: f,
        brushKey: key,
      };
      lastSeedRef.current = p;
      addSeed(key, f, p);
      return;
    }

    if (selected && mode === "select") {
      // 1. Uji hit vertex poligon atau tombol [+] tambah titik
      if (selected.shape === "polygon" && Array.isArray(selected.polygon_points)) {
        const vIdx = hitPolyVertex(selected, p);
        if (vIdx !== null) {
          dragRef.current = {
            type: "poly-vertex",
            frameId: selected.id,
            startCanvas: p,
            startFrame: selected,
            vertexIndex: vIdx,
          };
          return;
        }
        const addIdx = hitPolyAddPoint(selected, p);
        if (addIdx !== null) {
          const [lx, ly] = localPoint(selected, p);
          const newPts = [...selected.polygon_points];
          const newVertex = {
            x: Math.round(lx + selected.width / 2),
            y: Math.round(ly + selected.height / 2),
          };
          newPts.splice(addIdx + 1, 0, newVertex);
          const updated = { ...selected, polygon_points: newPts };
          updateFrame(selected.id, { polygon_points: newPts });
          dragRef.current = {
            type: "poly-vertex",
            frameId: selected.id,
            startCanvas: p,
            startFrame: updated,
            vertexIndex: addIdx + 1,
          };
          return;
        }
      }

      // 2. Uji hit rotate handle
      const ht = hitHandle(selected, p);
      if (ht === "rotate") {
        const c = {
          x: selected.x + selected.width / 2,
          y: selected.y + selected.height / 2,
        };
        dragRef.current = {
          type: "rotate",
          frameId: selected.id,
          startCanvas: p,
          startFrame: selected,
          grabAngle: Math.atan2(p.y - c.y, p.x - c.x),
        };
        return;
      }
      if (ht) {
        const f = selected;
        const d = ht.replace(/^resize-/, "");
        const sx = d.includes("e") ? 1 : d.includes("w") ? -1 : 0;
        const sy = d.includes("s") ? 1 : d.includes("n") ? -1 : 0;
        const anchorLocal: [number, number] = [
          (-sx * f.width) / 2,
          (-sy * f.height) / 2,
        ];
        const rad = (f.rotation * Math.PI) / 180;
        const c = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
        const anchor = {
          x:
            c.x +
            anchorLocal[0] * Math.cos(rad) -
            anchorLocal[1] * Math.sin(rad),
          y:
            c.y +
            anchorLocal[0] * Math.sin(rad) +
            anchorLocal[1] * Math.cos(rad),
        };
        const dx0 = p.x - anchor.x;
        const dy0 = p.y - anchor.y;
        dragRef.current = {
          type: ht,
          frameId: f.id,
          startCanvas: p,
          startFrame: f,
          anchor,
          grabLx: dx0 * Math.cos(-rad) - dy0 * Math.sin(-rad),
          grabLy: dx0 * Math.sin(-rad) + dy0 * Math.cos(-rad),
        };
        return;
      }
    }

    const hit = hitFrame(p);
    setSelectedId(hit ? hit.id : null);
    if (hit) {
      dragRef.current = {
        type: "move",
        frameId: hit.id,
        startCanvas: p,
        startFrame: hit,
      };
    }
  };

  // Kursor ala software grafis sesuai handle yang di-hover
  const HANDLE_CURSORS: Partial<Record<DragType, string>> = {
    "resize-e": "ew-resize",
    "resize-w": "ew-resize",
    "resize-n": "ns-resize",
    "resize-s": "ns-resize",
    "resize-ne": "nesw-resize",
    "resize-sw": "nesw-resize",
    "resize-nw": "nwse-resize",
    "resize-se": "nwse-resize",
    rotate: "grab",
  };

  const updateCursor = (p: { x: number; y: number }) => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (mode !== "select") {
      cursorRef.current = p;
      cv.style.cursor = "none";
      scheduleRender();
      return;
    }
    cursorRef.current = null;
    let cur = "";
    if (selected) {
      if (selected.shape === "polygon" && Array.isArray(selected.polygon_points)) {
        if (hitPolyVertex(selected, p) !== null) {
          cv.style.cursor = "pointer";
          return;
        }
        if (hitPolyAddPoint(selected, p) !== null) {
          cv.style.cursor = "copy";
          return;
        }
      }
      const ht = hitHandle(selected, p);
      if (ht) cur = HANDLE_CURSORS[ht] ?? "";
      else if (hitFrame(p)) cur = "move";
    }
    cv.style.cursor = cur;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const p = toCanvas(e.clientX, e.clientY);
    if (!drag) {
      updateCursor(p);
      return;
    }
    const f0 = drag.startFrame;

    if (drag.type === "poly-vertex" && typeof drag.vertexIndex === "number") {
      const [lx, ly] = localPoint(f0, p);
      const newPts = [...(f0.polygon_points || [])];
      newPts[drag.vertexIndex] = {
        x: Math.round(lx + f0.width / 2),
        y: Math.round(ly + f0.height / 2),
      };
      updateFrame(drag.frameId, { polygon_points: newPts });
      return;
    }

    if (drag.type === "brush") {
      cursorRef.current = p;
      const last = lastSeedRef.current;
      const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : Infinity;
      if (dist >= Math.max(3, brushSize / 4)) {
        lastSeedRef.current = p;
        if (drag.brushKey) addSeed(drag.brushKey, f0, p);
      }
      scheduleRender();
      return;
    }

    if (drag.type === "move") {
      const dx = p.x - drag.startCanvas.x;
      const dy = p.y - drag.startCanvas.y;
      updateFrame(f0.id, { x: f0.x + dx, y: f0.y + dy });
      return;
    }

    if (drag.type === "rotate") {
      const c = { x: f0.x + f0.width / 2, y: f0.y + f0.height / 2 };
      let deg =
        (f0.rotation +
          ((Math.atan2(p.y - c.y, p.x - c.x) - (drag.grabAngle ?? 0)) * 180) /
            Math.PI) %
        360;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      // Snap halus dekat kelipatan 15° dan 0°
      for (const snap of [-180, -90, 0, 90, 180]) {
        if (Math.abs(deg - snap) < 2) deg = snap;
      }
      for (let s = -180; s <= 180; s += 15) {
        if (Math.abs(deg - s) < 1) deg = s;
      }
      updateFrame(f0.id, { rotation: Math.round(deg * 10) / 10 });
      return;
    }

    // Resize gaya software grafis — berbasis DELTA pointer sejak mulai drag:
    // - Tepi yang ditarik bergeser PERSIS mengikuti pointer (1:1, tanpa lompatan
    //   awal), sisi/sudut berlawanan tetap terkunci di anchor.
    // - Corner: width & height bebas mengikuti arah tarikan.
    const rad = (f0.rotation * Math.PI) / 180;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    const ax = p.x - (drag.anchor?.x ?? 0);
    const ay = p.y - (drag.anchor?.y ?? 0);
    const lx = ax * cos - ay * sin;
    const ly = ax * sin + ay * cos;

    // Konvensi arah SAMA dengan onPointerDown: baca sufiks setelah "resize-"
    const d = drag.type.replace(/^resize-/, "");
    const dirX = d.includes("e") ? 1 : d.includes("w") ? -1 : 0;
    const dirY = d.includes("s") ? 1 : d.includes("n") ? -1 : 0;

    const dlx = lx - (drag.grabLx ?? 0);
    const dly = ly - (drag.grabLy ?? 0);

    const newW =
      dirX !== 0 ? Math.max(MIN_SIZE, f0.width + dirX * dlx) : f0.width;
    const newH =
      dirY !== 0 ? Math.max(MIN_SIZE, f0.height + dirY * dly) : f0.height;

    // Posisi tengah baru agar anchor (sisi/sudut berlawanan) tetap
    const offX = dirX * (newW / 2);
    const offY = dirY * (newH / 2);
    const cr = Math.cos(rad);
    const sr = Math.sin(rad);
    const ncx = (drag.anchor?.x ?? 0) + offX * cr - offY * sr;
    const ncy = (drag.anchor?.y ?? 0) + offX * sr + offY * cr;

    updateFrame(f0.id, {
      width: newW,
      height: newH,
      x: ncx - newW / 2,
      y: ncy - newH / 2,
    });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.type === "brush") {
      lastSeedRef.current = null;
      scheduleRender();
    }
  };

  /** Pointer canvas → koordinat konten frame (px template, basis kiri-atas). */
  const toContentLocal = (
    f: CameraFrame,
    p: { x: number; y: number },
  ): [number, number] => {
    const rad = (f.rotation * Math.PI) / 180;
    const fx = f.flip_h ? -1 : 1;
    const fy = f.flip_v ? -1 : 1;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    let dx = p.x - (f.x + f.width / 2);
    let dy = p.y - (f.y + f.height / 2);
    // Pointer → koordinat konten: balikkan flip dulu, lalu rotasi
    dx *= fx;
    dy *= fy;
    return [
      dx * cos - dy * sin + f.width / 2,
      dx * sin + dy * cos + f.height / 2,
    ];
  };

  const addSeed = (
    key: BrushKey,
    f: CameraFrame,
    p: { x: number; y: number },
  ) => {
    const [lx, ly] = toContentLocal(f, p);
    if (lx < 0 || ly < 0 || lx > f.width || ly > f.height) return;
    updateFrame(f.id, {
      [key]: [
        ...f[key],
        { x: Math.round(lx), y: Math.round(ly), s: strokeSeqRef.current },
      ],
    } as Partial<CameraFrame>);
  };

  const eraseSeeds = (
    f: CameraFrame,
    key: BrushKey,
    p: { x: number; y: number },
  ) => {
    const radius = brushSize / 2 / viewRef.current.scale;
    const inRadius = (s: { x: number; y: number }) => {
      const c = toCanvasPoint(f, s.x, s.y);
      return Math.hypot(c.x - p.x, c.y - p.y) <= radius;
    };
    updateFrame(f.id, {
      [key]: f[key].filter((s) => !inRadius(s)),
    } as Partial<CameraFrame>);
  };

  /** Koordinat konten lokal → koordinat canvas template. */
  const toCanvasPoint = (
    f: CameraFrame,
    ax: number,
    ay: number,
  ): { x: number; y: number } => {
    const rad = (f.rotation * Math.PI) / 180;
    const fx = f.flip_h ? -1 : 1;
    const fy = f.flip_v ? -1 : 1;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    const lx = ax - f.width / 2;
    const ly = ay - f.height / 2;
    const xr = lx * cos - ly * sin;
    const yr = lx * sin + ly * cos;
    return { x: cx + xr * fx, y: cy + yr * fy };
  };

  // ===== Undo / Redo history =====
  const historyRef = useRef<CameraFrame[][]>([]);
  const redoRef = useRef<CameraFrame[][]>([]);
  const lastHistAtRef = useRef(0);

  /**
   * Simpan salinan kondisi frames saat ini ke stack undo (maks 60 langkah).
   * Setiap edit baru membatalkan jalur redo — perilaku standar editor.
   */
  const pushHistory = () => {
    historyRef.current.push(frames.map((f) => ({ ...f })));
    if (historyRef.current.length > 60) historyRef.current.shift();
    redoRef.current.length = 0;
  };

  // ===== Frame ops =====
  const updateFrame = (fid: number, patch: Partial<CameraFrame>) => {
    // Satu langkah undo per "burst" edit — drag/slider kontinu memanggil
    // updateFrame puluhan kali per detik; jangan banjiri history.
    const now = Date.now();
    if (now - lastHistAtRef.current > 500) pushHistory();
    lastHistAtRef.current = now;
    setFrames((prev) =>
      prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
    );
  };

  const addFrame = () => {
    if (!template) return;
    pushHistory();
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1;
    const w = template.canvas_width * 0.45;
    const h = template.canvas_height * 0.28;
    const offset = frames.length * 24;
    const nf = normalizeFrame({
      id: newId,
      order: frames.length,
      shape: "rectangle",
      source: "manual",
      x: (template.canvas_width - w) / 2 + offset,
      y: (template.canvas_height - h) / 2 + offset,
      width: w,
      height: h,
      rotation: 0,
      ...DEFAULT_CLEAR,
    });
    setFrames((prev) => [...prev, nf]);
    setSelectedId(newId);
    setMode("select");
  };

  const addCircleFrame = () => {
    if (!template) return;
    pushHistory();
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1;
    const size = Math.min(template.canvas_width * 0.38, template.canvas_height * 0.28);
    const offset = frames.length * 24;
    const nf = normalizeFrame({
      id: newId,
      order: frames.length,
      shape: "ellipse",
      source: "manual",
      x: (template.canvas_width - size) / 2 + offset,
      y: (template.canvas_height - size) / 2 + offset,
      width: size,
      height: size,
      rotation: 0,
      ...DEFAULT_CLEAR,
    });
    setFrames((prev) => [...prev, nf]);
    setSelectedId(newId);
    setMode("select");
  };

  const addPolygonFrame = () => {
    if (!template) return;
    pushHistory();
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1;
    const w = template.canvas_width * 0.45;
    const h = template.canvas_height * 0.32;
    const offset = frames.length * 24;
    const pts = generateDefaultPolygon(w, h, 8);
    const nf = normalizeFrame({
      id: newId,
      order: frames.length,
      shape: "polygon",
      source: "manual",
      polygon_points: pts,
      x: (template.canvas_width - w) / 2 + offset,
      y: (template.canvas_height - h) / 2 + offset,
      width: w,
      height: h,
      rotation: 0,
      ...DEFAULT_CLEAR,
    });
    setFrames((prev) => [...prev, nf]);
    setSelectedId(newId);
    setMode("select");
  };

  const clearAllFrames = () => {
    if (frames.length === 0) return;
    pushHistory();
    setFrames([]);
    setSelectedId(null);
    toast.info("Semua frame dibersihkan.");
  };

  const duplicateFrame = () => {
    if (!selected) return;
    pushHistory();
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1;
    const copy = normalizeFrame({
      ...selected,
      id: newId,
      order: frames.length,
      x: selected.x + 24,
      y: selected.y + 24,
      protected_areas: selected.protected_areas.map((a) => ({ ...a })),
      remove_areas: selected.remove_areas.map((a) => ({ ...a })),
      remove_seeds: selected.remove_seeds.map((s) => ({ ...s })),
      protect_seeds: selected.protect_seeds.map((s) => ({ ...s })),
      keep_seeds: selected.keep_seeds.map((s) => ({ ...s })),
    });
    setFrames((prev) => [...prev, copy]);
    setSelectedId(newId);
  };

  const deleteFrame = () => {
    if (!selected) return;
    pushHistory();
    setFrames((prev) => prev.filter((f) => f.id !== selected.id));
    setSelectedId(null);
  };

  /** Undo: pulihkan snapshot terakhir yang benar-benar berbeda. */
  const undo = () => {
    const cur = JSON.stringify(frames);
    while (historyRef.current.length > 0) {
      const snap = historyRef.current.pop()!;
      if (JSON.stringify(snap) === cur) continue; // lewati snapshot redundan
      // Kondisi sekarang masuk jalur redo agar Ctrl+Y bisa memulihkannya
      redoRef.current.push(frames.map((f) => ({ ...f })));
      if (redoRef.current.length > 60) redoRef.current.shift();
      setFrames(snap);
      setSelectedId((sid) => (snap.some((f) => f.id === sid) ? sid : null));
      return;
    }
    // Satu-satunya umpan balik undo: hanya saat tidak ada yang bisa dipulihkan
    toast.info("Tidak ada lagi yang bisa di-undo");
  };

  /** Redo (Ctrl+Y / Ctrl+Shift+Z): kebalikan undo. */
  const redo = () => {
    const cur = JSON.stringify(frames);
    while (redoRef.current.length > 0) {
      const snap = redoRef.current.pop()!;
      if (JSON.stringify(snap) === cur) continue;
      // Langsung dorong ke stack undo — JANGAN lewat pushHistory (menghapus redo)
      historyRef.current.push(frames.map((f) => ({ ...f })));
      if (historyRef.current.length > 60) historyRef.current.shift();
      setFrames(snap);
      setSelectedId((sid) => (snap.some((f) => f.id === sid) ? sid : null));
      return;
    }
    toast.info("Tidak ada yang bisa di-redo");
  };

  // ===== Clipboard frame =====
  const clipboardRef = useRef<CameraFrame | null>(null);

  const copyFrame = () => {
    if (!selected) return;
    // Senyap: hasil copy langsung terasa lewat Ctrl+V, tak perlu notifikasi
    clipboardRef.current = { ...selected };
  };

  const pasteFrame = () => {
    if (!clipboardRef.current) return;
    pushHistory();
    const newId = Math.max(0, ...frames.map((f) => f.id)) + 1;
    const copy = normalizeFrame({
      ...clipboardRef.current,
      id: newId,
      order: frames.length,
      x: clipboardRef.current.x + 24,
      y: clipboardRef.current.y + 24,
    });
    setFrames((prev) => [...prev, copy]);
    setSelectedId(newId);
  };

  // ===== Dual Mode: Manual / Auto Render =====
  const runAutoDetect = async () => {
    if (!template || detecting) return;
    setDetecting(true);
    try {
      let detected: CameraFrame[] = [];
      let isTransparent = false;

      // 1. Coba backend detector terlebih dahulu
      try {
        const backendDetected = await templateApi.detectFrames(template.id);
        if (backendDetected && backendDetected.length > 0) {
          detected = backendDetected;
          isTransparent = detected.some((f) => f.source === "transparent");
        }
      } catch {
        // Fallback ke client-side detector
      }

      // 2. Jika backend tidak berhasil (atau di serverless tanpa PHP GD), jalankan client-side detector via HTML5 Canvas
      if (detected.length === 0 && templateImgRef.current) {
        const clientResult = detectFramesFromImage(
          templateImgRef.current,
          template.canvas_width,
          template.canvas_height
        );
        detected = clientResult.frames;
        isTransparent = clientResult.method === "transparent";
      }

      pushHistory(); // deteksi bisa di-undo (Ctrl+Z) bila hasilnya tidak cocok
      setFrames(detected);
      setSelectedId(null);

      if (detected.length === 0) {
        toast.error("Tidak ada area foto yang terdeteksi pada template ini.");
      } else {
        const modeLabel = isTransparent ? " (Transparency Detection)" : " (Smart Clear)";
        toast.success(`Frames Detected: ${detected.length}${modeLabel}`);
      }
    } catch {
      toast.error("Gagal menjalankan auto detection.");
      setFrameMode("manual");
    } finally {
      setDetecting(false);
    }
  };

  const switchFrameMode = (m: "manual" | "auto") => {
    if (m === frameMode || detecting) return;
    if (m === "auto") {
      // Simpan hasil kerja manual agar bisa dipulihkan saat kembali
      manualBackupRef.current = frames;
      setFrameMode("auto");
      // Langsung proses deteksi tanpa tombol tambahan
      void runAutoDetect();
    } else {
      setFrameMode("manual");
      // Kembalikan susunan manual terakhir (perbandingan non-destruktif)
      if (manualBackupRef.current) {
        setFrames(manualBackupRef.current);
        setSelectedId(null);
      }
    }
  };

  // ===== Keyboard shortcuts =====
  // Undo Ctrl+Z · Redo Ctrl+Y / Ctrl+Shift+Z · Copy Ctrl+C · Paste Ctrl+V ·
  // Duplicate Ctrl+D · Delete/Backspace hapus frame terpilih.
  // Diabaikan saat fokus di input.
  const keyActionsRef = useRef({
    undo,
    redo,
    copyFrame,
    pasteFrame,
    duplicateFrame,
    deleteFrame,
  });
  keyActionsRef.current = {
    undo,
    redo,
    copyFrame,
    pasteFrame,
    duplicateFrame,
    deleteFrame,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && e.shiftKey) {
        e.preventDefault();
        keyActionsRef.current.redo();
      } else if (mod && k === "y") {
        e.preventDefault();
        keyActionsRef.current.redo();
      } else if (mod && k === "z") {
        e.preventDefault();
        keyActionsRef.current.undo();
      } else if (mod && k === "c") {
        e.preventDefault();
        keyActionsRef.current.copyFrame();
      } else if (mod && k === "v") {
        e.preventDefault();
        keyActionsRef.current.pasteFrame();
      } else if (mod && k === "d") {
        e.preventDefault();
        keyActionsRef.current.duplicateFrame();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        keyActionsRef.current.deleteFrame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ===== Confirm Template =====
  const handleConfirm = async () => {
    if (!template || frames.length === 0) return;
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        payload: {
          frame_configuration: frames,
          frame_count: frames.length,
          status: "active",
        },
      });
      toast.success("Template dikonfirmasi dan siap dipakai.");
      navigate("/templates");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(
        error.response?.data?.message ||
          "Gagal menyimpan konfigurasi template.",
      );
    }
  };

  // ===== Loading / error =====
  if (templateQuery.isLoading || !template) {
    return (
      <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" className="text-[#FF5A36]" />
        <p className="font-retro text-[var(--pb-text-muted)] text-lg sm:text-xl font-bold">
          Memuat Frame Editor...
        </p>
      </div>
    );
  }

  const numInput = (
    label: string,
    value: number,
    onChange: (v: number) => void,
  ) => (
    <div>
      <label className="block font-retro text-[var(--pb-text-secondary)] text-sm sm:text-base font-bold mb-1">
        {label}
      </label>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-2.5 py-2 font-retro text-[var(--pb-text)] text-base sm:text-lg font-bold text-center focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
      />
    </div>
  );

  const slider = (
    label: string,
    key: keyof Pick<
      CameraFrame,
      | "clear_zone"
      | "clear_expansion"
      | "region_sensitivity"
      | "min_region_size"
      | "edge_protection"
      | "feather"
      | "edge_cleanup"
    >,
    min: number,
    max: number,
    step: number,
    suffix: string,
  ) =>
    selected && (
      <div key={key} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold">
            {label}
          </label>
          <span className="font-retro text-[var(--pb-text)] text-base sm:text-lg font-bold tabular-nums">
            {Number.isInteger(selected[key])
              ? selected[key]
              : Number(selected[key].toFixed(1))}
            {suffix}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={selected[key]}
          onChange={(e) =>
            updateFrame(selected.id, {
              [key]: Number(e.target.value),
            } as Partial<CameraFrame>)
          }
          className="w-full accent-[#FF5A36] h-2.5 bg-[var(--pb-bg)] rounded-lg cursor-pointer"
        />
      </div>
    );

  return (
    <div className="flex flex-col w-full min-h-full pb-6">
      {/* ===== Header Bar (Tier 1: Nav & Confirmation) ===== */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0 bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-3 sm:p-4 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/templates")}
            leftIcon={<ArrowLeft size={16} />}
          >
            Kembali
          </Button>
          <div className="min-w-0 flex items-center gap-2 sm:gap-2.5">
            <h1 className="font-pixel text-[var(--pb-text)] text-sm sm:text-base lg:text-lg leading-tight truncate">
              Frame Editor
            </h1>
            <span
              className="pb-draft-badge text-amber-300 font-pixel px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-[3px] bg-amber-500/20 border-[2px] border-amber-500/40 text-[9px] sm:text-[10px] font-bold shrink-0 shadow-[2px_2px_0px_#000]"
              title="Confirm template agar bisa dipakai sesi"
            >
              Draft
            </span>
            <span className="hidden md:inline-block font-retro text-[var(--pb-text-muted)] text-sm sm:text-base font-bold truncate max-w-[160px] lg:max-w-[220px]">
              · {template.name}
            </span>
          </div>
        </div>

        {/* Action Buttons: Test Camera & Confirm */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <Button
            variant={testCamera ? "primary" : "secondary"}
            size="sm"
            onClick={() => {
              if (testCamera) {
                setTestCamera(false);
              } else {
                if (videoRef.current) {
                  videoRef.current.play().catch(() => {});
                }
                setTestCamera(true);
              }
            }}
            leftIcon={testCamera ? <VideoOff size={16} /> : <Video size={16} />}
          >
            <span className="hidden sm:inline">{testCamera ? "Stop Test" : "Test Camera"}</span>
            <span className="sm:hidden">{testCamera ? "Stop" : "Test"}</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            loading={updateTemplate.isPending}
            disabled={frames.length === 0}
            leftIcon={<Check size={16} />}
          >
            Confirm
          </Button>
        </div>
      </div>

      {/* ===== Toolbar (Tier 2: Manual / Auto Render Mode Switcher) ===== */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0 bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-3 py-2 sm:px-4 sm:py-2.5 shadow-[2px_2px_0px_#000]">
        <div className="flex items-center gap-2">
          <span className="font-retro text-[var(--pb-text-secondary)] text-sm sm:text-base font-bold uppercase tracking-wider hidden sm:inline">
            Mode Penentuan Frame:
          </span>
          <div className="flex rounded-[4px] border-[2px] border-[var(--pb-border-strong)] overflow-hidden bg-[var(--pb-bg)] p-0.5 gap-0.5 sm:gap-1 shadow-[1px_1px_0px_#000]">
            <button
              type="button"
              onClick={() => switchFrameMode("manual")}
              disabled={detecting}
              className={`flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-[3px] font-retro text-sm sm:text-base font-bold transition-all disabled:opacity-50 cursor-pointer ${
                frameMode === "manual"
                  ? "bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000]"
                  : "text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-surface)]"
              }`}
            >
              <MousePointer2 size={14} />
              <span>Manual</span>
            </button>
            <button
              type="button"
              onClick={() => switchFrameMode("auto")}
              disabled={detecting}
              className={`flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-[3px] font-retro text-sm sm:text-base font-bold transition-all disabled:opacity-50 cursor-pointer ${
                frameMode === "auto"
                  ? "bg-[#FFB800] text-black border-[2px] border-black shadow-[2px_2px_0px_#000]"
                  : "text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-surface)]"
              }`}
            >
              <Wand2 size={14} />
              <span>Auto Render</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base font-bold">
            {frames.length} Frame
          </span>
        </div>
      </div>

      {cameraError && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2 shrink-0">
          {cameraError}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* ===== Canvas ===== */}
        <div
          ref={containerRef}
          className="relative w-full h-[50vh] sm:h-[58vh] lg:h-auto lg:flex-1 bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)] overflow-hidden shrink-0 lg:shrink min-h-[320px]"
        >
          {/* Video element tersembunyi untuk fallback capture stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "320px",
              height: "240px",
              opacity: 0.001,
              zIndex: -1,
              pointerEvents: "none",
            }}
          />

          {/* Live Video Slots di belakang Canvas (100% Native WebKit/Safari Hardware Accelerated di iPhone & Laptop) */}
          {testCamera && template && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${viewRef.current.ox}px`,
                top: `${viewRef.current.oy}px`,
                width: `${template.canvas_width * viewRef.current.scale}px`,
                height: `${template.canvas_height * viewRef.current.scale}px`,
                zIndex: 1,
              }}
            >
              {frames.map((f) => (
                <div
                  key={f.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: `${(f.x / template.canvas_width) * 100}%`,
                    top: `${(f.y / template.canvas_height) * 100}%`,
                    width: `${(f.width / template.canvas_width) * 100}%`,
                    height: `${(f.height / template.canvas_height) * 100}%`,
                    transform: `rotate(${f.rotation}deg)`,
                    borderRadius: f.shape === "ellipse" ? "50%" : undefined,
                  }}
                >
                  <video
                    ref={(el) => {
                      if (el && streamRef.current && el.srcObject !== streamRef.current) {
                        el.srcObject = streamRef.current;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    webkit-playsinline="true"
                    muted
                    className="w-full h-full object-cover"
                    style={{
                      transform: `scaleX(${f.flip_h ? 1 : -1}) scaleY(${f.flip_v ? -1 : 1})`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none z-10"
            style={{ cursor: mode === "select" ? "default" : "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              if (cursorRef.current) {
                cursorRef.current = null;
                scheduleRender();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
          {detecting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60">
              <Spinner size="lg" className="text-cyan-400" />
              <p className="text-pb-text text-sm font-medium">
                Detecting Frames...
              </p>
            </div>
          )}
          {frames.length === 0 && !detecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Layers size={40} className="text-pb-faint mb-3" />
              <p className="text-pb-text-secondary text-sm mb-4">
                Belum ada camera frame.
              </p>
              <div className="pointer-events-auto">
                <Button
                  variant="primary"
                  size="md"
                  onClick={addFrame}
                  leftIcon={<Plus size={16} />}
                >
                  Tambah Frame
                </Button>
              </div>
            </div>
          )}
          {/* Penanda versi build — untuk memastikan bundle terbaru yang dimuat */}
          <div className="absolute bottom-2 right-3 text-[10px] text-pb-text-muted select-none pointer-events-none">
            editor-v20 · responsive
          </div>
        </div>

        {/* ===== Sidebar Controls ===== */}
        <div className="w-full lg:w-96 shrink-0 overflow-y-visible lg:overflow-y-auto pr-0 lg:pr-1 space-y-4 pb-8 lg:pb-0">
          {/* Frames Section */}
          <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
            <h3 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm font-bold mb-3 flex items-center gap-2">
              <Layers size={16} className="text-[#FF5A36]" />
              <span>Camera Frames ({frames.length})</span>
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={undo}
                disabled={historyRef.current.length === 0}
                leftIcon={<Undo2 size={15} />}
              >
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={redo}
                disabled={redoRef.current.length === 0}
                leftIcon={<Redo2 size={15} />}
              >
                Redo
              </Button>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={addFrame}
                leftIcon={<Plus size={15} />}
              >
                Add
              </Button>
            </div>
            <p className="font-retro text-xs sm:text-sm text-[var(--pb-text-muted)] mb-3 leading-relaxed">
              Ctrl+Z undo · Ctrl+Y redo · Ctrl+C copy · Ctrl+V paste · Ctrl+D duplikat · Backspace hapus
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {frames.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(f.id);
                    setMode("select");
                  }}
                  className={`w-full flex items-center justify-between rounded-[4px] px-3.5 py-2.5 text-left font-retro text-base sm:text-lg font-bold transition-all border-[2px] ${
                    f.id === selectedId
                      ? "bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:border-[#FFB800]"
                  }`}
                >
                  <span>Frame {i + 1}</span>
                  <span className="text-sm sm:text-base opacity-90 tabular-nums">
                    {Math.round(f.width)}×{Math.round(f.height)}
                    {f.rotation !== 0 ? ` · ${f.rotation}°` : ""}
                    {f.flip_h || f.flip_v ? " · flip" : ""}
                  </span>
                </button>
              ))}
              {frames.length === 0 && (
                <p className="font-retro text-[var(--pb-text-muted)] text-base py-2">Belum ada frame.</p>
              )}
            </div>
            {selected && (
              <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t-[2px] border-dashed border-[var(--pb-border)]">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={duplicateFrame}
                  leftIcon={<Copy size={15} />}
                >
                  Duplicate
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={deleteFrame}
                  leftIcon={<Trash2 size={15} />}
                >
                  Delete
                </Button>
              </div>
            )}
          </section>

          {/* Transform */}
          {selected && (
            <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)] space-y-4">
              <h3 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm font-bold">
                Transformasi Frame
              </h3>

              {/* Pilihan Bentuk Frame (Rectangle, Ellipse, Flexible Polygon) */}
              <div>
                <label className="font-retro text-[var(--pb-text-secondary)] text-sm sm:text-base font-bold block mb-1.5">
                  Bentuk Frame
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px]">
                  <button
                    type="button"
                    onClick={() => updateFrame(selected.id, { shape: "rectangle" })}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-[3px] font-retro text-sm sm:text-base font-bold transition-all ${
                      selected.shape === "rectangle" || !selected.shape
                        ? "bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000]"
                        : "text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-surface)]"
                    }`}
                  >
                    <Square size={18} />
                    <span>Persegi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFrame(selected.id, { shape: "ellipse" })}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-[3px] font-retro text-sm sm:text-base font-bold transition-all ${
                      selected.shape === "ellipse"
                        ? "bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000]"
                        : "text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-surface)]"
                    }`}
                  >
                    <Circle size={18} />
                    <span>Elips</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pts =
                        selected.polygon_points && selected.polygon_points.length >= 3
                          ? selected.polygon_points
                          : generateDefaultPolygon(selected.width, selected.height, 8);
                      updateFrame(selected.id, { shape: "polygon", polygon_points: pts });
                    }}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-[3px] font-retro text-sm sm:text-base font-bold transition-all ${
                      selected.shape === "polygon"
                        ? "bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000]"
                        : "text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-surface)]"
                    }`}
                  >
                    <Spline size={18} />
                    <span>Fleksibel</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {numInput("X", selected.x, (v) =>
                  updateFrame(selected.id, { x: v }),
                )}
                {numInput("Y", selected.y, (v) =>
                  updateFrame(selected.id, { y: v }),
                )}
                {numInput("W", selected.width, (v) =>
                  updateFrame(selected.id, { width: Math.max(MIN_SIZE, v) }),
                )}
                {numInput("H", selected.height, (v) =>
                  updateFrame(selected.id, { height: Math.max(MIN_SIZE, v) }),
                )}
              </div>

              {/* Rotation slider kontinu */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold">
                    Rotation / Tilt
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step={0.5}
                      min={-180}
                      max={180}
                      value={selected.rotation}
                      onChange={(e) => {
                        let v = Number(e.target.value);
                        if (Number.isNaN(v)) return;
                        v = Math.max(-180, Math.min(180, v));
                        updateFrame(selected.id, { rotation: v });
                      }}
                      className="w-20 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-2 py-1 font-retro text-[var(--pb-text)] text-base font-bold text-right tabular-nums focus:outline-none focus:border-[#FFB800]"
                    />
                    <span className="font-retro text-[var(--pb-text-muted)] text-base font-bold">°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={0.5}
                  value={selected.rotation}
                  onChange={(e) =>
                    updateFrame(selected.id, {
                      rotation: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#FF5A36] h-2.5 bg-[var(--pb-bg)] rounded-lg cursor-pointer"
                />
                <div className="flex justify-between font-retro text-xs sm:text-sm text-[var(--pb-text-muted)] font-bold">
                  <span>-180°</span>
                  <span>0°</span>
                  <span>+180°</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    updateFrame(selected.id, { flip_h: !selected.flip_h })
                  }
                  className={`flex items-center justify-center gap-2 rounded-[4px] px-3.5 py-2.5 font-retro text-base font-bold transition-all border-[2px] ${
                    selected.flip_h
                      ? "bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)]"
                  }`}
                >
                  <FlipHorizontal size={16} />
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateFrame(selected.id, { flip_v: !selected.flip_v })
                  }
                  className={`flex items-center justify-center gap-2 rounded-[4px] px-3.5 py-2.5 font-retro text-base font-bold transition-all border-[2px] ${
                    selected.flip_v
                      ? "bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)]"
                  }`}
                >
                  <FlipVertical size={16} />
                  Flip V
                </button>
              </div>
            </section>
          )}

          {/* Fine Tune Remove */}
          {selected && (
            <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)] space-y-4">
              <h3 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm font-bold">
                Fine Tune Remove
              </h3>
              <label className="flex items-center justify-between cursor-pointer p-2.5 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px]">
                <span className="font-retro text-[var(--pb-text)] text-base sm:text-lg font-bold flex items-center gap-2">
                  Full Clear
                  <span className="font-retro text-[var(--pb-text-muted)] text-sm font-normal">
                    (bolong 1 frame penuh)
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={selected.clear_zone >= 100}
                  onChange={(e) =>
                    updateFrame(selected.id, {
                      clear_zone: e.target.checked ? 100 : 60,
                    })
                  }
                  className="accent-[#FF5A36] w-5 h-5 cursor-pointer"
                />
              </label>
              {slider("Center Clear Priority", "clear_zone", 5, 100, 0.2, "%")}
              {slider("Clear Expansion", "clear_expansion", 0, 200, 0.2, "%")}
              {slider(
                "Region Sensitivity",
                "region_sensitivity",
                0,
                100,
                0.2,
                "",
              )}
              {slider(
                "Minimum Region Size",
                "min_region_size",
                0,
                50,
                0.2,
                "%",
              )}
              {slider("Edge Protection", "edge_protection", 0, 100, 0.2, "")}
              {slider("Edge Cleanup", "edge_cleanup", 0, 5, 0.2, "px")}
              {slider("Feather", "feather", 0, 20, 0.2, "px")}
            </section>
          )}

          {/* Manual Protect / Remove / Restore — Brush Region */}
          {selected && (
            <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
              <h3 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm font-bold mb-3">
                Brush Area
              </h3>
              <div className="grid grid-cols-4 gap-2 mb-3.5">
                <button
                  type="button"
                  onClick={() => setMode("select")}
                  className={`flex flex-col items-center gap-1.5 rounded-[4px] px-1.5 py-2.5 font-retro text-xs sm:text-sm font-bold transition-all border-[2px] ${
                    mode === "select"
                      ? "bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)]"
                  }`}
                >
                  <MousePointer2 size={16} />
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => setMode("remove")}
                  className={`flex flex-col items-center gap-1.5 rounded-[4px] px-1.5 py-2.5 font-retro text-xs sm:text-sm font-bold transition-all border-[2px] ${
                    mode === "remove"
                      ? "bg-red-600 text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-red-400"
                  }`}
                >
                  <Eraser size={16} />
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setMode("protect")}
                  className={`flex flex-col items-center gap-1.5 rounded-[4px] px-1.5 py-2.5 font-retro text-xs sm:text-sm font-bold transition-all border-[2px] ${
                    mode === "protect"
                      ? "bg-amber-500 text-black border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-amber-400"
                  }`}
                >
                  <Shield size={16} />
                  Protect
                </button>
                <button
                  type="button"
                  onClick={() => setMode("restore")}
                  className={`flex flex-col items-center gap-1.5 rounded-[4px] px-1.5 py-2.5 font-retro text-xs sm:text-sm font-bold transition-all border-[2px] ${
                    mode === "restore"
                      ? "bg-green-600 text-white border-black shadow-[2px_2px_0px_#000]"
                      : "bg-[var(--pb-bg)] border-[var(--pb-border-strong)] text-green-400"
                  }`}
                >
                  <Undo2 size={16} />
                  Keep
                </button>
              </div>
              {mode !== "select" && (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <label className="font-retro text-[var(--pb-text-secondary)] text-base font-bold">
                      Brush Size
                    </label>
                    <span className="font-retro text-[var(--pb-text)] text-base font-bold tabular-nums">
                      {brushSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={96}
                    step={0.2}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-[#FF5A36] h-2.5 bg-[var(--pb-bg)] rounded-lg cursor-pointer"
                  />
                  <p className="font-retro text-[var(--pb-text-muted)] text-xs sm:text-sm leading-relaxed mt-2">
                    {mode === "remove" &&
                      "Usap area yang ingin dijadikan kamera — seluruh region terhubung ikut terhapus sampai batas warna berbeda."}
                    {mode === "protect" &&
                      "Usap elemen desain yang ingin dipertahankan — seluruh region-nya dilindungi dari clear."}
                    {mode === "restore" &&
                      "Usap desain yang terlanjur ter-clear — seluruh region-nya dikembalikan tampil."}{" "}
                    Alt+klik untuk menghapus sapuan.
                  </p>
                </div>
              )}
              {(selected.protected_areas.length > 0 ||
                selected.remove_areas.length > 0 ||
                selected.remove_seeds.length > 0 ||
                selected.protect_seeds.length > 0 ||
                selected.keep_seeds.length > 0) && (
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() =>
                    updateFrame(selected.id, {
                      protected_areas: [],
                      remove_areas: [],
                      remove_seeds: [],
                      protect_seeds: [],
                      keep_seeds: [],
                    })
                  }
                >
                  Reset Semua Area Manual
                </Button>
              )}
            </section>
          )}

          {/* Preview */}
          <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-retro text-[var(--pb-text)] text-base sm:text-lg font-bold flex items-center gap-2">
                <Eye size={18} className="text-[#00FFCC]" />
                Preview Mask Real-time
              </span>
              <input
                type="checkbox"
                checked={previewMask}
                onChange={(e) => setPreviewMask(e.target.checked)}
                className="accent-[#FF5A36] w-5 h-5 cursor-pointer"
              />
            </label>
            <p className="font-retro text-[var(--pb-text-muted)] text-xs sm:text-sm mt-2 leading-relaxed">
              Desain selalu berada DI ATAS kamera. Elemen desain di luar Hard
              Clear Zone otomatis dipertahankan kamera di-mask di bawahnya.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TemplateFrameEditorPage;
