import React, { useState } from 'react'
import { Folder as FolderIcon, ImageIcon, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import type { Folder } from '@/types'

// ==========================================
// Move Photo Modal — pilih folder tujuan
// Termasuk opsi "Tanpa Folder" (galeri utama)
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
      <p className="text-pb-text-secondary text-sm mb-4">
        Pilih folder tujuan untuk {count > 1 ? `${count} foto` : 'foto ini'}.
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pb-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari folder..."
          className="w-full bg-pb-bg border border-pb-border rounded-lg pl-9 pr-4 py-2.5
            text-pb-text text-sm placeholder:text-pb-faint
            focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10 transition-colors"
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
            {/* Opsi tanpa folder — galeri utama */}
            {!query || 'tanpa folder galeri utama'.includes(query.toLowerCase()) ? (
              <button
                type="button"
                onClick={() => onConfirm(null)}
                disabled={isMoving}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  text-left text-sm text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated
                  transition-colors disabled:opacity-50"
              >
                <ImageIcon size={16} className="text-pb-text-muted" />
                <span className="flex-1">Tanpa Folder (Galeri Utama)</span>
              </button>
            ) : null}

            {filtered.length === 0 && query ? (
              <p className="text-pb-text-muted text-sm text-center py-8">
                Folder tidak ditemukan.
              </p>
            ) : (
              filtered.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onConfirm(folder.id)}
                  disabled={isMoving}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                    text-left text-sm text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated
                    transition-colors disabled:opacity-50"
                  style={{ paddingLeft: `${12 + depth * 20}px` }}
                >
                  <FolderIcon size={16} className="text-pb-text-muted" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="text-xs text-pb-text-muted">
                    {folder.photo_count ?? 0} foto
                  </span>
                </button>
              ))
            )}
          </>
        )}
      </div>

      <div className="flex justify-end mt-5">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isMoving}>
          Batal
        </Button>
      </div>
    </Modal>
  )
}

export default MovePhotoModal