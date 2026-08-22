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
      <p className="text-pb-text-secondary text-sm mb-4">
        Pilih folder induk tujuan untuk {count > 1 ? `${count} folder` : 'folder ini'}.
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pb-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari folder..."
          className="w-full bg-pb-bg border border-pb-border rounded-xl pl-9 pr-4 py-2.5
            text-pb-text text-sm placeholder:text-pb-faint
            focus:outline-none focus:ring-1 focus:border-[#FF5A36] transition-colors"
        />
      </div>

      {/* Folder list */}
      <div className="max-h-64 overflow-y-auto space-y-1">
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                  text-left text-sm text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated
                  transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Home size={16} className="text-[#FF5A36]" />
                <span className="flex-1 font-semibold text-pb-text">Tingkat Teratas (Root Galeri)</span>
              </button>
            ) : null}

            {filtered.length === 0 && query ? (
              <p className="text-pb-text-muted text-sm text-center py-8">
                Tidak ada folder yang cocok.
              </p>
            ) : (
              filtered.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onConfirm(folder.id)}
                  disabled={isMoving}
                  style={{ paddingLeft: `${12 + depth * 16}px` }}
                  className="w-full flex items-center gap-3 pr-3 py-2.5 rounded-xl
                    text-left text-sm text-pb-text hover:bg-pb-elevated
                    transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <FolderIcon size={16} className="text-amber-400 shrink-0" />
                  <span className="truncate flex-1">{folder.name}</span>
                </button>
              ))
            )}
          </>
        )}
      </div>

      <div className="flex justify-end mt-4 pt-3 border-t border-pb-border">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isMoving}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}

export default MoveFolderModal
