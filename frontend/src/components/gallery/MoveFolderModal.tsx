import React, { useState } from 'react'
import { Folder as FolderIcon, Home, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import type { Folder } from '@/types'

// ==========================================
// Move Folder Modal — pilih folder induk tujuan
// ==========================================

interface MoveFolderModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (targetParentFolderId: number | null) => void
  folders: Folder[]
  isLoadingFolders: boolean
  isMoving: boolean
  count?: number
  /** Folder-folder yang sedang dipindahkan — tidak boleh jadi tujuan */
  excludeFolderIds?: number[]
}

const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
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
    <Modal isOpen={isOpen} onClose={onClose} title="Pindahkan Folder" size="sm">
      <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-4">
        Pilih folder induk tujuan untuk {count > 1 ? `${count} folder` : 'folder ini'}.
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
            {/* Opsi Root / Tingkat Teratas */}
            {!query || 'root tingkat teratas utama galeri'.includes(query.toLowerCase()) ? (
              <button
                type="button"
                onClick={() => onConfirm(null)}
                disabled={isMoving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-[4px] border-[2px] border-[var(--pb-border-strong)] bg-[var(--pb-bg)]
                  text-left font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] hover:border-[#FFB800] hover:bg-[var(--pb-elevated)]
                  shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-all disabled:opacity-50 cursor-pointer"
              >
                <Home size={20} className="text-[#FF5A36] shrink-0" />
                <span className="flex-1">Tingkat Teratas (Root Galeri)</span>
              </button>
            ) : null}

            {filtered.length === 0 && query ? (
              <p className="font-retro text-[var(--pb-text-muted)] text-base text-center py-8">
                Tidak ada folder yang cocok.
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
                  <span className="truncate flex-1">{folder.name}</span>
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

export default MoveFolderModal
