import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Layers,
  Plus,
  Trash2,
  Upload,
  ImageIcon,
  FileImage,
  X,
  SlidersHorizontal,
  AlertCircle,
  CheckSquare,
  Square,
  Check,
  Pencil,
} from "lucide-react";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState, Spinner } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  templateApi,
} from "@/hooks/useTemplates";
import { getStorageUrl } from "@/api/client";
import type { Template } from "@/types";

// ==========================================
// Templates Management Page
// Alur wajib: Upload Template -> Frame Editor -> Confirm -> Ready.
// Template baru berstatus DRAFT dan belum bisa dipakai Photo Session.
// ==========================================

interface UploadForm {
  name: string;
  canvas_width: string;
  canvas_height: string;
}

const EMPTY_FORM: UploadForm = {
  name: "",
  canvas_width: "1080",
  canvas_height: "1920",
};

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const templatesQuery = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [renameTarget, setRenameTarget] = useState<Template | null>(null);
  const [renameName, setRenameName] = useState("");

  // ===== Seleksi Massal =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);

  const templates = templatesQuery.data ?? [];

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "template" | "preview",
  ) => {
    const file = e.target.files?.[0] ?? null;
    if (kind === "template") {
      setTemplateFile(file);
      if (file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          setForm((prev) => ({
            ...prev,
            canvas_width: String(img.naturalWidth || img.width),
            canvas_height: String(img.naturalHeight || img.height),
          }));
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    } else {
      setPreviewFile(file);
    }
  };

  const setField = (field: keyof UploadForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openUpload = () => {
    setForm(EMPTY_FORM);
    setTemplateFile(null);
    setPreviewFile(null);
    setIsUploadOpen(true);
  };

  const handleUpload = async () => {
    if (!templateFile) {
      toast.error("Pilih file template terlebih dahulu.");
      return;
    }

    const width = Number(form.canvas_width);
    const height = Number(form.canvas_height);

    if (!form.name.trim()) {
      toast.error("Nama template wajib diisi.");
      return;
    }
    if (!width || width < 100 || !height || height < 100) {
      toast.error("Ukuran canvas minimal 100px.");
      return;
    }

    try {
      const created = await createTemplate.mutateAsync({
        name: form.name.trim(),
        template_file: templateFile,
        preview_file: previewFile,
        canvas_width: width,
        canvas_height: height,
      });
      toast.success("Template diunggah. Atur posisi kamera di Frame Editor.");
      setIsUploadOpen(false);
      navigate(`/templates/${created.id}/editor`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(
        error.response?.data?.message || "Gagal mengunggah template.",
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate.mutateAsync(deleteTarget.id);
      toast.success("Template berhasil dihapus.");
      setDeleteTarget(null);
    } catch {
      toast.error("Gagal menghapus template.");
      setDeleteTarget(null);
    }
  };

  // ===== Handlers Seleksi Massal =====
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === templates.length
        ? new Set()
        : new Set(templates.map((t) => t.id)),
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => templateApi.remove(id)));
      toast.success(`${selectedIds.size} template berhasil dihapus.`);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkDeleteOpen(false);
    } catch {
      toast.error("Gagal menghapus beberapa template.");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)]">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="font-pixel text-[var(--pb-text)] text-base sm:text-lg lg:text-xl leading-relaxed">Kelola Template</h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-lg sm:text-xl mt-1 tracking-wide">
            Upload &gt;&gt; Frame Editor &gt;&gt; Test Camera &gt;&gt; Confirm &gt;&gt; READY
          </p>
        </div>

        {/* Action Buttons & Bulk Select */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {selectionMode ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectAll}
                leftIcon={<CheckSquare size={16} />}
              >
                {selectedIds.size === templates.length && templates.length > 0
                  ? "Batal Semua"
                  : "Pilih Semua"}
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  leftIcon={<Trash2 size={16} />}
                >
                  Hapus ({selectedIds.size})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              >
                Batal
              </Button>
            </>
          ) : (
            <>
              {templates.length > 0 && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setSelectionMode(true)}
                  leftIcon={<CheckSquare size={16} />}
                >
                  Pilih
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={openUpload}
                leftIcon={<Upload size={16} />}
              >
                Upload Template
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ===== Konten (scroll area) ===== */}
      <div className="flex-1 min-h-0 pb-6">
        {/* ===== Info Cards ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mb-6">
          {[
            { label: "Format yang Didukung", value: "PNG, JPG, WEBP" },
            { label: "Ukuran Canvas", value: "Bebas (pixel based)" },
            { label: "Alur Wajib", value: "Confirm Frame Editor sebelum sesi" },
          ].map((info) => (
            <div
              key={info.label}
              className="bg-[var(--pb-surface)] border-[2px] border-dashed border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]"
            >
              <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg mb-1 uppercase tracking-wider font-bold">{info.label}</p>
              <p className="font-pixel text-[var(--pb-text)] text-[10px] sm:text-xs leading-relaxed">{info.value}</p>
            </div>
          ))}
        </div>

        {/* ===== Template List ===== */}
        {templatesQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 bg-pb-surface border border-pb-border rounded-2xl">
            <Spinner size="lg" className="text-pb-text" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-pb-surface border border-pb-border rounded-2xl">
            <EmptyState
              icon={<Layers size={48} />}
              title="Belum ada template"
              description="Upload template desain dari Canva atau program desain lainnya. Setelah upload, atur posisi kamera pada Frame Editor."
              action={
                <Button
                  variant="outline"
                  size="md"
                  onClick={openUpload}
                  leftIcon={<Upload size={16} />}
                >
                  Upload Template
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4 lg:gap-5">
            {templates.map((template) => {
              const isSelected = selectedIds.has(template.id);
              return (
                <div
                  key={template.id}
                  className={`group relative aspect-[3/4] bg-[var(--pb-surface)] overflow-hidden
                    transition-all
                    duration-150 ease-out
                    border-[3px]
                    rounded-none
                    shadow-[3px_3px_0px_#000,6px_6px_0px_var(--pb-shadow-solid)]
                    hover:shadow-[5px_5px_0px_#000,10px_10px_0px_var(--pb-shadow-solid)]
                    hover:-translate-x-1 hover:-translate-y-1
                    ${selectionMode ? "cursor-pointer select-none" : ""}
                    ${
                      isSelected
                        ? "border-[#FFB800] shadow-[3px_3px_0px_#000,6px_6px_0px_#FF5A36]"
                        : template.status === "draft"
                          ? "border-amber-500/80"
                          : "border-white hover:border-[#FF5A36]"
                    }`}
                  onClick={selectionMode ? () => handleToggleSelect(template.id) : undefined}
                >
                  {/* Image / Preview */}
                  {template.preview_url ? (
                    <img
                      src={getStorageUrl(template.preview_url)}
                      alt={template.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : template.template_url ? (
                    <img
                      src={getStorageUrl(template.template_url)}
                      alt={template.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--pb-elevated)]">
                      <ImageIcon size={20} className="text-[var(--pb-faint)]" />
                    </div>
                  )}

                  {/* Scanline overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none z-[1]"
                    style={{
                      background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)',
                    }}
                  />

                  {/* Selection checkbox */}
                  {selectionMode ? (
                    <div className="absolute top-1.5 left-1.5 z-10">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-none flex items-center justify-center border-[2px] transition-all ${
                          isSelected
                            ? "bg-[#FF5A36] border-black text-white shadow-[2px_2px_0px_#000]"
                            : "bg-black/70 border-white/60 text-white/60"
                        }`}
                      >
                        {isSelected ? (
                          <Check size={11} className="stroke-[3]" />
                        ) : (
                          <Square size={11} />
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Action buttons */
                    <div className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 z-10 flex flex-col gap-0.5 sm:gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/templates/${template.id}/editor`);
                        }}
                        className="template-card-btn-cyan w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-none bg-black/90 text-[#00FFCC] border-[1.5px] sm:border-[2px] border-[#00FFCC]/60 shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center cursor-pointer"
                        title="Buka Frame Editor"
                        aria-label="Buka Frame Editor"
                      >
                        <SlidersHorizontal size={9} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(template);
                          setRenameName(template.name);
                        }}
                        className="template-card-btn-yellow w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-none bg-black/90 text-[#FFB800] border-[1.5px] sm:border-[2px] border-[#FFB800]/60 shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center cursor-pointer"
                        title="Ubah Nama Template"
                        aria-label="Ubah Nama Template"
                      >
                        <Pencil size={9} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(template);
                        }}
                        className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-none bg-black/90 text-red-400 border-[1.5px] sm:border-[2px] border-red-500/60 shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center cursor-pointer"
                        title="Hapus Template"
                        aria-label="Hapus Template"
                      >
                        <Trash2 size={9} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                    </div>
                  )}

                  {/* Draft badge / Frame count badge */}
                  {template.status === "draft" ? (
                    <span className="absolute top-1 right-1 sm:top-2 sm:right-2 flex items-center gap-0.5 px-1 py-0.5 sm:px-2 sm:py-1 rounded-none bg-amber-500 text-black text-[6px] sm:text-[8px] md:text-[9px] font-pixel shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] z-10 border sm:border-[2px] border-black">
                      !DRAFT
                    </span>
                  ) : (
                    <span className="absolute top-1 right-1 sm:top-2 sm:right-2 font-pixel text-white text-[7px] sm:text-[9px] md:text-[10px] px-1 py-0.5 sm:px-2 sm:py-1 rounded-none bg-black/90 border border-[#FF5A36] shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] z-10">
                      x{template.frame_count}
                    </span>
                  )}

                  {/* Bottom overlay — hidden on mobile so it doesn't obstruct the template design, visible on sm+, fades out on hover */}
                  <div className="hidden sm:flex absolute bottom-0 left-0 right-0 p-2 sm:p-3 bg-black/55 border-t-[2px] border-[#FF5A36] z-[2] items-end justify-between gap-1 transition-opacity duration-150 group-hover:opacity-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-retro text-white text-base sm:text-lg truncate leading-tight font-bold">
                        {template.name}
                      </p>
                      <p className="font-retro pb-size-text font-bold text-sm sm:text-base mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                        {template.canvas_width}x{template.canvas_height} px
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Modal Upload Template ===== */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload Template Baru"
        size="lg"
      >
        <div className="space-y-4">
          {/* Nama Template */}
          <div>
            <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2">
              Nama Template <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Contoh: Photobooth Strip Retro 3 Frame"
              className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-3
                font-retro text-lg sm:text-xl font-bold text-[var(--pb-text)] placeholder:text-[var(--pb-faint)]
                focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-colors"
            />
          </div>

          {/* File Template */}
          <div>
            <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2">
              File Template Desain <span className="text-red-400">*</span>
            </label>
            <input
              ref={templateInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e, "template")}
            />
            <button
              type="button"
              onClick={() => templateInputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-3 border-[2px] border-dashed rounded-[4px] px-4 py-6 transition-all text-left shadow-[2px_2px_0px_var(--pb-shadow-solid)] cursor-pointer ${
                templateFile
                  ? "bg-green-500/10 border-green-500 text-green-400"
                  : "border-[var(--pb-border-strong)] hover:border-[#FFB800] hover:bg-[var(--pb-elevated)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)]"
              }`}
            >
              {templateFile ? (
                <>
                  <FileImage size={24} className="text-green-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-retro text-base sm:text-lg font-bold truncate text-[var(--pb-text)]">{templateFile.name}</p>
                    <p className="font-retro text-sm text-[var(--pb-text-muted)]">
                      {(templateFile.size / 1024 / 1024).toFixed(1)} MB · Siap diunggah
                    </p>
                  </div>
                  <span className="font-retro text-sm text-green-400 font-bold px-3 py-1 bg-green-500/20 rounded-[3px] border border-green-500/40 shrink-0">
                    Ganti
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <Upload size={26} className="text-[#FF5A36] mb-1.5" />
                  <p className="font-retro text-base sm:text-lg font-bold text-[var(--pb-text)]">
                    Pilih File Template Gambar
                  </p>
                  <p className="font-retro text-sm text-[var(--pb-text-muted)] mt-0.5">
                    Format PNG, JPG, WEBP (maks. 20 MB)
                  </p>
                </div>
              )}
            </button>
          </div>

          {/* File Preview (opsional) */}
          <div>
            <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2">
              Gambar Preview Katalog (opsional)
            </label>
            <input
              ref={previewInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e, "preview")}
            />
            <button
              type="button"
              onClick={() => previewInputRef.current?.click()}
              className="w-full flex items-center gap-3 border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-3 bg-[var(--pb-bg)]
                text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:border-[#FFB800] hover:bg-[var(--pb-elevated)] shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-colors cursor-pointer"
            >
              {previewFile ? (
                <>
                  <FileImage size={20} className="text-green-400 shrink-0" />
                  <span className="font-retro text-base sm:text-lg font-bold truncate text-[var(--pb-text)] flex-1 text-left">{previewFile.name}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFile(null);
                    }}
                    className="p-1 rounded-[3px] text-[var(--pb-text-muted)] hover:text-red-400 hover:bg-red-500/10"
                    title="Hapus file preview"
                  >
                    <X size={16} />
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon size={20} className="text-[var(--pb-text-muted)] shrink-0" />
                  <span className="font-retro text-base text-[var(--pb-text-muted)]">Pilih thumbnail preview (opsional)</span>
                </>
              )}
            </button>
          </div>

          {/* Dimensi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-1.5">
                Lebar Canvas (px)
              </label>
              <input
                type="number"
                value={form.canvas_width}
                onChange={(e) => setField("canvas_width", e.target.value)}
                min={100}
                className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-2.5
                  font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
              />
            </div>
            <div>
              <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-1.5">
                Tinggi Canvas (px)
              </label>
              <input
                type="number"
                value={form.canvas_height}
                onChange={(e) => setField("canvas_height", e.target.value)}
                min={100}
                className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-2.5
                  font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
              />
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-3.5 shadow-[2px_2px_0px_var(--pb-shadow-solid)]">
            <SlidersHorizontal
              size={18}
              className="text-[#FF5A36] mt-0.5 shrink-0"
            />
            <p className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base leading-relaxed">
              Setelah upload, Anda otomatis diarahkan ke{" "}
              <span className="text-[var(--pb-text)] font-bold">Frame Editor</span>{" "}
              untuk mengatur lubang kamera, lalu tekan{" "}
              <span className="text-[var(--pb-text)] font-bold">Confirm Template</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-3 border-t-[2px] border-[var(--pb-border)]">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setIsUploadOpen(false)}
            disabled={createTemplate.isPending}
          >
            Batal
          </Button>
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={handleUpload}
            loading={createTemplate.isPending}
          >
            {createTemplate.isPending
              ? "Mengunggah..."
              : "Unggah & Buka Editor"}
          </Button>
        </div>
      </Modal>

      {/* ===== Delete Single Confirm ===== */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Template"
        message={
          deleteTarget
            ? `Template "${deleteTarget.name}" beserta file-nya akan dihapus permanen. Lanjutkan?`
            : ""
        }
        confirmLabel="Ya, Hapus"
        loading={deleteTemplate.isPending}
        danger
      />

      {/* ===== Delete Bulk Confirm ===== */}
      <ConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Hapus Template Terpilih"
        message={`${selectedIds.size} template yang dipilih beserta file-nya akan dihapus permanen. Lanjutkan?`}
        confirmLabel={`Ya, Hapus (${selectedIds.size})`}
        loading={isBulkDeleting}
        danger
      />

      {/* ===== Modal Ubah Nama Template ===== */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Ubah Nama Template"
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renameTarget || !renameName.trim()) return;
            try {
              await updateTemplate.mutateAsync({
                id: renameTarget.id,
                payload: { name: renameName.trim() },
              });
              toast.success("Nama template berhasil diperbarui.");
              setRenameTarget(null);
            } catch {
              toast.error("Gagal memperbarui nama template.");
            }
          }}
        >
          <div className="mb-5">
            <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2">
              Nama Template
            </label>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Masukkan nama template..."
              required
              autoFocus
              className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-3
                font-retro text-lg sm:text-xl font-bold text-[var(--pb-text)] placeholder:text-[var(--pb-faint)]
                focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-colors"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t-[2px] border-[var(--pb-border)]">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setRenameTarget(null)}
              disabled={updateTemplate.isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={updateTemplate.isPending || !renameName.trim()}
              loading={updateTemplate.isPending}
            >
              Simpan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TemplatesPage;
