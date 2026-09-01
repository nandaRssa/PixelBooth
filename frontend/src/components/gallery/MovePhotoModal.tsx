import React, { useState } from 'react'
import { Folder as FolderIcon, ImageIcon, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import type { Folder } from '@/types'

// ==========================================
// Move Photo Modal — pilih folder tujuan
// ==========================================

interface MovePhotoModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (folderId: number | null) => void
  folders: Folder[]
  isLoadingFolders: boolean
  isMoving: boolean
  count?: number
  /** Folder yang sedang menampung foto — tidak perlu jadi opsi tujuan */
  excludeFolderIds?: number[]
}

const MovePhotoModal: React.FC<MovePhotoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  folders,
  isLoadingFolders,
  isMoving,
  count = 1,
  excludeFolderIds = [],
}) => {
  const [query, setQuery] = useState('')

  const flatItems = React.useMemo(() => {
    const items: { folder: Folder; depth: number }[] = []
    const excluded = new Set(excludeFolderIds)
    const walk = (list: Folder[], depth: number) => {
      for (const folder of list) {
        if (!excluded.has(folder.id)) {
          items.push({ folder, depth })
        }
        if (folder.children?.length) walk(folder.children, depth + 1)
      }
    }
    walk(folders, 0)
    return items
  }, [folders, excludeFolderIds])

  const filtered = flatItems.filter(({ folder }) =>
    folder.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pindahkan Foto" size="sm">
      <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-4">
        Pilih folder tujuan untuk {count > 1 ? `${count} foto` : 'foto ini'}.
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pb-text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari folder tujuan..."
          className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] pl-11 pr-4 py-2.5
            font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] placeholder:text-[var(--pb-faint)]
            focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-colors"
        />
      </div>

      {/* Folder list */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
        {isLoadingFolders ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" className="text-pb-text" />
          </div>
        ) : (
          <>
            {/* Opsi tanpa folder — galeri utama */}
            {!query || 'tanpa folder galeri utama'.includes(query.toLowerCase()) ? (
              <button
                type="button"
                onClick={() => onConfirm(null)}
                disabled={isMoving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-[4px] border-[2px] border-[var(--pb-border-strong)] bg-[var(--pb-bg)]
                  text-left font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] hover:border-[#FFB800] hover:bg-[var(--pb-elevated)]
                  shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-all disabled:opacity-50 cursor-pointer"
              >
                <ImageIcon size={20} className="text-[#FF5A36] shrink-0" />
                <span className="flex-1">Tanpa Folder (Galeri Utama)</span>
              </button>
            ) : null}

            {filtered.length === 0 && query ? (
              <p className="font-retro text-[var(--pb-text-muted)] text-base text-center py-8">
                Folder tidak ditemukan.
              </p>
            ) : (
              filtered.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onConfirm(folder.id)}
                  disabled={isMoving}
                  style={{ paddingLeft: `${14 + depth * 18}px` }}
                  className="w-full flex items-center gap-3 pr-4 py-3 rounded-[4px] border-[2px] border-[var(--pb-border-strong)] bg-[var(--pb-bg)]
                    text-left font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] hover:border-[#FFB800] hover:bg-[var(--pb-elevated)]
                    shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-all disabled:opacity-50 cursor-pointer"
                >
                  <FolderIcon size={20} className="text-[var(--pb-yellow)] shrink-0 stroke-[2.5]" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="font-retro text-sm text-[var(--pb-text-muted)] font-normal">
                    {folder.photo_count ?? 0} foto
                  </span>
                </button>
              ))
            )}
          </>
        )}
      </div>

      <div className="flex justify-end mt-5 pt-3 border-t-[2px] border-[var(--pb-border)]">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isMoving}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}

export default MovePhotoModal