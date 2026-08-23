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
    if (kind === "template") setTemplateFile(file);
    else setPreviewFile(file);
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
          <h1 className="text-pb-text text-xl sm:text-2xl font-bold">Kelola Template</h1>
          <p className="text-pb-text-muted text-xs sm:text-sm mt-1">
            Upload → Frame Editor → Test Camera → Confirm → Siap dipakai
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            { label: "Format yang Didukung", value: "PNG, JPG, WEBP" },
            { label: "Ukuran Canvas", value: "Bebas (pixel based)" },
            { label: "Alur Wajib", value: "Confirm Frame Editor sebelum sesi" },
          ].map((info) => (
            <div
              key={info.label}
              className="bg-pb-surface border border-pb-border rounded-xl p-3 sm:p-4 shadow-xs"
            >
              <p className="text-pb-text-muted text-[11px] sm:text-xs mb-0.5">{info.label}</p>
              <p className="text-pb-text text-xs sm:text-sm font-semibold">{info.value}</p>
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
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  onClick={
                    selectionMode
                      ? () => handleToggleSelect(template.id)
                      : undefined
                  }
                  className={`group relative aspect-[3/4] bg-pb-surface border rounded-xl overflow-hidden shadow-xs hover:shadow-xl transition-colors duration-200 ${
                    selectionMode ? "cursor-pointer select-none" : ""
                  } ${
                    isSelected
                      ? "border-[#FF5A36] ring-2 ring-[#FF5A36]/50"
                      : template.status === "draft"
                        ? "border-amber-500/40"
                        : "border-pb-border hover:border-pb-border-strong"
                  }`}
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
                    <div className="absolute inset-0 flex items-center justify-center bg-pb-elevated">
                      <ImageIcon size={20} className="text-pb-faint" />
                    </div>
                  )}

                  {/* Mode Seleksi: Checkbox / Selection Circle */}
                  {selectionMode ? (
                    <div className="absolute top-1.5 left-1.5 z-10">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-[#FF5A36] text-white shadow-md"
                            : "bg-black/60 backdrop-blur-sm border border-white/40 text-white/60"
                        }`}
                      >
                        {isSelected ? (
                          <Check size={12} className="stroke-[3]" />
                        ) : (
                          <Square size={12} />
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Tombol Edit Frame, Ubah Nama, & Hapus: SELALU TAMPIL */
                    <div className="absolute top-1.5 left-1.5 z-10 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/templates/${template.id}/editor`);
                        }}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-black/80 backdrop-blur-md text-cyan-300 hover:text-cyan-200 border border-white/20 shadow-md active:scale-95 transition-all flex items-center justify-center"
                        title="Buka Frame Editor"
                        aria-label="Buka Frame Editor"
                      >
                        <SlidersHorizontal size={11} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(template);
                          setRenameName(template.name);
                        }}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-black/80 backdrop-blur-md text-amber-300 hover:text-amber-200 border border-white/20 shadow-md active:scale-95 transition-all flex items-center justify-center"
                        title="Ubah Nama Template"
                        aria-label="Ubah Nama Template"
                      >
                        <Pencil size={11} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(template);
                        }}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-black/80 backdrop-blur-md text-red-400 hover:text-red-300 border border-white/20 shadow-md active:scale-95 transition-all flex items-center justify-center"
                        title="Hapus Template"
                        aria-label="Hapus Template"
                      >
                        <Trash2 size={11} className="sm:w-[13px] sm:h-[13px]" />
                      </button>
                    </div>
                  )}

                  {/* Status badge */}
                  {template.status === "draft" ? (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded-md bg-amber-500 text-black text-[8px] sm:text-[10px] font-bold shadow-md z-10">
                      <AlertCircle size={9} />
                      Draft
                    </span>
                  ) : (
                    <span className="absolute top-1.5 right-1.5 px-1 sm:px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-white text-[8px] sm:text-[10px] font-medium border border-white/10 shadow-md z-10">
                      {template.frame_count} f
                    </span>
                  )}

                  {/* Overlay Bawah */}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex items-end justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[11px] sm:text-xs font-semibold truncate leading-tight">
                        {template.name}
                      </p>
                      <p className="text-white/70 text-[9px] sm:text-[10px] mt-0.5">
                        {template.canvas_width} x {template.canvas_height}
                      </p>
                    </div>
                    {template.status === "draft" && !selectionMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/templates/${template.id}/editor`);
                        }}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#FF5A36] text-white hover:bg-[#ff7354] active:scale-95 shadow-md flex items-center justify-center transition-all shrink-0"
                        title="Konfigurasi Frame"
                        aria-label="Konfigurasi Frame"
                      >
                        <SlidersHorizontal size={11} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Upload Modal ===== */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload Template Baru"
        size="lg"
      >
        <div className="space-y-3.5">
          {/* Nama Template */}
          <div>
            <label className="block text-pb-text text-xs font-semibold mb-1.5">
              Nama Template <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Contoh: Photobooth Strip Retro 3 Frame"
              className="w-full bg-pb-bg border border-pb-border rounded-xl px-3.5 py-2.5
                text-pb-text text-xs sm:text-sm placeholder:text-pb-faint
                focus:outline-none focus:ring-1 focus:border-[#FF5A36] transition-colors"
            />
          </div>

          {/* File Template */}
          <div>
            <label className="block text-pb-text text-xs font-semibold mb-1.5">
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
              className={`w-full flex items-center justify-center gap-2.5 border border-dashed rounded-xl px-4 py-5 transition-all text-left ${
                templateFile
                  ? "bg-green-500/10 border-green-500/40 text-green-400"
                  : "border-pb-border hover:border-pb-border-strong hover:bg-pb-elevated text-pb-text-secondary hover:text-pb-text"
              }`}
            >
              {templateFile ? (
                <>
                  <FileImage size={20} className="text-green-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold truncate text-pb-text">{templateFile.name}</p>
                    <p className="text-[11px] text-pb-text-muted">
                      {(templateFile.size / 1024 / 1024).toFixed(1)} MB · Siap diunggah
                    </p>
                  </div>
                  <span className="text-xs text-green-400 font-semibold px-2 py-1 bg-green-500/20 rounded-lg shrink-0">
                    Ganti
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <Upload size={22} className="text-[#FF5A36] mb-1.5" />
                  <p className="text-xs sm:text-sm font-semibold text-pb-text">
                    Pilih File Template Gambar
                  </p>
                  <p className="text-[11px] text-pb-text-muted mt-0.5">
                    Format PNG, JPG, WEBP (maks. 20 MB)
                  </p>
                </div>
              )}
            </button>
          </div>

          {/* File Preview (opsional) */}
          <div>
            <label className="block text-pb-text text-xs font-semibold mb-1.5">
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
              className="w-full flex items-center gap-2.5 border border-pb-border rounded-xl px-3.5 py-2.5
                text-pb-text-secondary hover:text-pb-text hover:border-pb-border-strong hover:bg-pb-elevated transition-colors"
            >
              {previewFile ? (
                <>
                  <FileImage size={16} className="text-green-400 shrink-0" />
                  <span className="text-xs sm:text-sm truncate text-pb-text flex-1 text-left">{previewFile.name}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFile(null);
                    }}
                    className="p-1 rounded-lg text-pb-text-muted hover:text-red-400 hover:bg-red-500/10"
                    title="Hapus file preview"
                  >
                    <X size={14} />
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon size={16} className="text-pb-text-muted shrink-0" />
                  <span className="text-xs sm:text-sm text-pb-text-muted">Pilih thumbnail preview (opsional)</span>
                </>
              )}
            </button>
          </div>

          {/* Dimensi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-pb-text text-xs font-semibold mb-1.5">
                Lebar Canvas (px)
              </label>
              <input
                type="number"
                value={form.canvas_width}
                onChange={(e) => setField("canvas_width", e.target.value)}
                min={100}
                className="w-full bg-pb-bg border border-pb-border rounded-xl px-3.5 py-2.5
                  text-pb-text text-xs sm:text-sm focus:outline-none focus:ring-1 focus:border-[#FF5A36]"
              />
            </div>
            <div>
              <label className="block text-pb-text text-xs font-semibold mb-1.5">
                Tinggi Canvas (px)
              </label>
              <input
                type="number"
                value={form.canvas_height}
                onChange={(e) => setField("canvas_height", e.target.value)}
                min={100}
                className="w-full bg-pb-bg border border-pb-border rounded-xl px-3.5 py-2.5
                  text-pb-text text-xs sm:text-sm focus:outline-none focus:ring-1 focus:border-[#FF5A36]"
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-pb-elevated/70 border border-pb-border rounded-xl p-3">
            <SlidersHorizontal
              size={15}
              className="text-[#FF5A36] mt-0.5 shrink-0"
            />
            <p className="text-pb-text-muted text-[11px] sm:text-xs leading-relaxed">
              Setelah upload, Anda otomatis diarahkan ke{" "}
              <span className="text-pb-text font-semibold">Frame Editor</span>{" "}
              untuk mengatur lubang kamera, lalu tekan{" "}
              <span className="text-pb-text font-semibold">Confirm Template</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-5">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setIsUploadOpen(false)}
            disabled={createTemplate.isPending}
            className="text-xs sm:text-sm font-medium"
          >
            Batal
          </Button>
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={handleUpload}
            loading={createTemplate.isPending}
            className="text-xs sm:text-sm font-semibold"
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
          <div className="mb-4">
            <label className="block text-pb-text text-sm font-medium mb-1.5">
              Nama Template
            </label>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Masukkan nama template..."
              required
              autoFocus
              className="w-full bg-pb-bg border border-pb-border rounded-xl px-3.5 py-2.5
                text-pb-text text-sm placeholder:text-pb-faint
                focus:outline-none focus:ring-1 focus:border-[#FF5A36] transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-pb-border">
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
