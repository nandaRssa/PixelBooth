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
} from "lucide-react";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState, Spinner } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import {
  useTemplates,
  useCreateTemplate,
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
  const deleteTemplate = useDeleteTemplate();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6 shrink-0">
        <div>
          <h1 className="text-pb-text text-2xl font-bold">Kelola Template</h1>
          <p className="text-pb-text-muted text-sm mt-1">
            Upload → Frame Editor → Test Camera → Confirm → Siap dipakai
          </p>
        </div>

        {/* Action Buttons & Bulk Select */}
        <div className="flex items-center gap-2 shrink-0">
          {selectionMode ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectAll}
                leftIcon={<CheckSquare size={16} />}
              >
                {selectedIds.size === templates.length && templates.length > 0
                  ? "Batal Pilih Semua"
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
                Batalkan
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
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {/* ===== Info ===== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Format yang Didukung", value: "PNG, JPG, WEBP" },
            { label: "Ukuran Canvas", value: "Bebas (pixel based)" },
            { label: "Alur Wajib", value: "Confirm Frame Editor sebelum sesi" },
          ].map((info) => (
            <div
              key={info.label}
              className="bg-pb-surface border border-pb-border rounded-xl px-4 py-4"
            >
              <p className="text-pb-text-muted text-xs mb-1">{info.label}</p>
              <p className="text-pb-text text-sm font-medium">{info.value}</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {templates.map((template) => {
              const isSelected = selectedIds.has(template.id);
              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -5, scale: 1.02 }}
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
                      ? "border-pb-accent ring-2 ring-pb-accent/50"
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
                      <ImageIcon size={32} className="text-pb-faint" />
                    </div>
                  )}

                  {/* Mode Seleksi: Checkbox / Selection Circle */}
                  {selectionMode ? (
                    <div className="absolute top-2 left-2 z-10">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-pb-accent text-pb-on-accent shadow-md"
                            : "bg-black/60 backdrop-blur-sm border border-white/40 text-white/60"
                        }`}
                      >
                        {isSelected ? (
                          <Check size={16} className="stroke-[3]" />
                        ) : (
                          <Square size={16} />
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Tombol Edit & Hapus: SELALU TAMPIL (Ramah Tablet/Touch & Kontras Tinggi) */
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/templates/${template.id}/editor`);
                        }}
                        className="w-9 h-9 rounded-xl bg-black/75 backdrop-blur-md text-cyan-300 hover:text-cyan-200 border border-white/20 shadow-lg active:scale-95 transition-all flex items-center justify-center"
                        title="Buka Frame Editor"
                        aria-label="Buka Frame Editor"
                      >
                        <SlidersHorizontal size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(template);
                        }}
                        className="w-9 h-9 rounded-xl bg-black/75 backdrop-blur-md text-red-400 hover:text-red-300 border border-white/20 shadow-lg active:scale-95 transition-all flex items-center justify-center"
                        title="Hapus Template"
                        aria-label="Hapus Template"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}

                  {/* Status badge */}
                  {template.status === "draft" ? (
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-black text-xs font-semibold shadow-md z-10">
                      <AlertCircle size={12} />
                      Draft
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-white text-xs font-medium border border-white/10 shadow-md z-10">
                      {template.frame_count} frame
                    </span>
                  )}

                  {/* Overlay Bawah */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                    <p className="text-white text-sm font-semibold truncate">
                      {template.name}
                    </p>
                    <p className="text-white/80 text-xs mt-0.5">
                      {template.canvas_width} x {template.canvas_height}
                    </p>
                    {template.status === "draft" && !selectionMode && (
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/templates/${template.id}/editor`);
                        }}
                        leftIcon={<SlidersHorizontal size={13} />}
                      >
                        Konfigurasi Frame
                      </Button>
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
        title="Upload Template"
        size="lg"
      >
        <div className="space-y-4">
          {/* Nama */}
          <div>
            <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
              Nama Template
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Contoh: Classic Strip 3 Frame"
              className="w-full bg-pb-bg border border-pb-border rounded-lg px-4 py-2.5
                text-pb-text text-sm placeholder:text-pb-faint
                focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10 transition-colors"
            />
          </div>

          {/* File Template */}
          <div>
            <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
              File Template <span className="text-red-400">*</span>
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
              className="w-full flex items-center justify-center gap-2 border border-dashed border-pb-border rounded-lg px-4 py-6
                text-pb-text-secondary hover:text-pb-text hover:border-pb-border-strong hover:bg-pb-elevated transition-colors"
            >
              {templateFile ? (
                <>
                  <FileImage size={18} className="text-green-400" />
                  <span className="text-sm">{templateFile.name}</span>
                  <span className="text-xs text-pb-text-muted">
                    ({(templateFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span className="text-sm">
                    Pilih file template (PNG/JPG/WEBP, maks 20 MB)
                  </span>
                </>
              )}
            </button>
          </div>

          {/* File Preview (opsional) */}
          <div>
            <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
              Preview (opsional)
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
              className="w-full flex items-center gap-2 border border-pb-border rounded-lg px-4 py-3
                text-pb-text-secondary hover:text-pb-text hover:border-pb-border-strong hover:bg-pb-elevated transition-colors"
            >
              {previewFile ? (
                <>
                  <FileImage size={16} className="text-green-400" />
                  <span className="text-sm truncate">{previewFile.name}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFile(null);
                    }}
                    className="ml-auto text-pb-text-muted hover:text-red-400"
                  >
                    <X size={14} />
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon size={16} />
                  <span className="text-sm">Tidak ada file preview</span>
                </>
              )}
            </button>
          </div>

          {/* Dimensi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
                Lebar (px)
              </label>
              <input
                type="number"
                value={form.canvas_width}
                onChange={(e) => setField("canvas_width", e.target.value)}
                min={100}
                className="w-full bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5
                  text-pb-text text-sm focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10"
              />
            </div>
            <div>
              <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
                Tinggi (px)
              </label>
              <input
                type="number"
                value={form.canvas_height}
                onChange={(e) => setField("canvas_height", e.target.value)}
                min={100}
                className="w-full bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5
                  text-pb-text text-sm focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5">
            <SlidersHorizontal
              size={15}
              className="text-cyan-400 mt-0.5 shrink-0"
            />
            <p className="text-pb-text-secondary text-xs leading-relaxed">
              Setelah upload, kamu langsung diarahkan ke{" "}
              <span className="text-pb-text font-medium">Frame Editor</span>{" "}
              untuk menentukan posisi kamera secara manual: tambah frame, geser,
              resize, rotasi, flip, atur masking, lalu{" "}
              <span className="text-pb-text font-medium">Test Camera</span> dan{" "}
              <span className="text-pb-text font-medium">Confirm Template</span>
              . Template baru berstatus{" "}
              <span className="text-amber-400 font-medium">Draft</span> dan
              belum bisa dipakai Photo Session sebelum dikonfirmasi.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setIsUploadOpen(false)}
            disabled={createTemplate.isPending}
          >
            Batal
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleUpload}
            loading={createTemplate.isPending}
            leftIcon={<Plus size={16} />}
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
    </div>
  );
};

export default TemplatesPage;
