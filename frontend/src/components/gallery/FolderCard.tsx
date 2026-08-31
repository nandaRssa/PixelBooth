import React from "react";
import {
  Check,
  Folder as FolderIcon,
  Pencil,
  QrCode,
  Square,
  Trash2,
} from "lucide-react";
import type { Folder } from "@/types";

// ==========================================
// Folder Card — Retro Arcade Style
// Hard border, solid shadow, push-down hover
// ==========================================

interface FolderCardProps {
  folder: Folder;
  onOpen: (folder: Folder) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onShowQr: (folder: Folder) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (folder: Folder) => void;
}

const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  onOpen,
  onRename,
  onDelete,
  onShowQr,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const subfolderCount =
    folder.subfolders_count ??
    folder.subfolder_count ??
    folder.children?.length ??
    0;
  const photoCount = folder.photos_count ?? folder.photo_count ?? 0;

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(folder);
      return;
    }
    onOpen(folder);
  };

  return (
    <div
      className={`
        group relative
        bg-[var(--pb-surface)]
        border-[2px]
        rounded-[4px]
        p-4 sm:p-5
        cursor-pointer
        flex flex-col justify-between
        transition-all
        duration-150 ease-out
        ${
          selectionMode
            ? isSelected
              ? "border-[#FFB800] shadow-[3px_3px_0px_#000,5px_5px_0px_#FF5A36] bg-[#1a0800]"
              : "border-[var(--pb-border-strong)] shadow-[3px_3px_0px_#000,5px_5px_0px_#FF5E00] hover:border-[#FFB800]"
            : "border-[var(--pb-border-strong)] shadow-[3px_3px_0px_#000,5px_5px_0px_#FF5E00] hover:border-[#FFB800] hover:shadow-[5px_5px_0px_#000,9px_9px_0px_#FF5E00] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0px_#000,2px_2px_0px_#FF5E00]"
        }
      `}
      onClick={handleClick}
    >
      {/* Top row: Icon/Checkbox & Action buttons */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[3px] flex items-center justify-center border-[2px] transition-all ${
                isSelected
                  ? "bg-[#FFB800] border-black text-black shadow-[2px_2px_0px_#000]"
                  : "bg-[var(--pb-elevated)] border-[var(--pb-border-strong)] text-[var(--pb-text-muted)]"
              }`}
            >
              {isSelected ? (
                <Check size={14} className="stroke-[3]" />
              ) : (
                <Square size={14} />
              )}
            </div>
            <span className="font-retro text-sm text-[var(--pb-text-secondary)] uppercase tracking-wide">
              {isSelected ? "Terpilih" : "Pilih"}
            </span>
          </div>
        ) : (
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] flex items-center justify-center shrink-0 shadow-[2px_2px_0px_var(--pb-shadow-solid)]">
            <FolderIcon size={20} className="text-[#FFB800]" />
          </div>
        )}

        {/* Action buttons (normal mode only) */}
        {!selectionMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShowQr(folder);
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-[3px] bg-[var(--pb-bg)] border-[2px] border-[#00FFCC] text-[#00FFCC] hover:bg-[var(--pb-border)] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center transition-colors shadow-[1px_1px_0px_var(--pb-shadow-solid)] cursor-pointer"
              title="Lihat QR Code"
              aria-label="Lihat QR Code"
            >
              <QrCode size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRename(folder);
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-[3px] bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:border-[#FFB800] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center transition-colors shadow-[1px_1px_0px_var(--pb-shadow-solid)]"
              title="Ubah Nama"
              aria-label="Ubah Nama"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder);
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-[3px] bg-[var(--pb-bg)] border-[2px] border-red-900/60 text-red-400 hover:bg-red-900/20 hover:border-red-500 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center transition-colors shadow-[1px_1px_0px_var(--pb-shadow-solid)]"
              title="Hapus Folder"
              aria-label="Hapus Folder"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom row: Name & counts */}
      <div>
        <h3 className="font-retro text-[var(--pb-text)] font-bold text-lg sm:text-xl truncate group-hover:text-[#FFB800] transition-colors leading-tight">
          {folder.name}
        </h3>
        <p className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base mt-1">
          {photoCount} foto
          {subfolderCount > 0 ? ` · ${subfolderCount} sub` : ""}
        </p>
      </div>
    </div>
  );
};

export default FolderCard;
