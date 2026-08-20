import React, { useState } from 'react'
import { Folder as FolderIcon, Search } from 'lucide-react'
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
  onConfirm: (folderId: number) => void
  folders: Folder[]
  isLoadingFolders: boolean
  isMoving: boolean
  count?: number
}

const MovePhotoModal: React.FC<MovePhotoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  folders,
  isLoadingFolders,
  isMoving,
  count = 1,
}) => {
  const [query, setQuery] = useState('')

  const filtered = folders.filter((folder) =>
    folder.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pindahkan Foto" size="sm">
      <p className="text-[#A0A0A0] text-sm mb-4">
        Pilih folder tujuan untuk {count > 1 ? `${count} foto` : 'foto ini'}.
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606060]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari folder..."
          className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg pl-9 pr-4 py-2.5
            text-white text-sm placeholder:text-[#404040]
            focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10 transition-colors"
        />
      </div>

      {/* Folder list */}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {isLoadingFolders ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" className="text-white" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[#606060] text-sm text-center py-8">
            {query ? 'Folder tidak ditemukan.' : 'Belum ada folder.'}
          </p>
        ) : (
          filtered.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onConfirm(folder.id)}
              disabled={isMoving}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-left text-sm text-[#A0A0A0] hover:text-white hover:bg-white/5
                transition-colors disabled:opacity-50"
            >
              <FolderIcon size={16} className="text-[#606060]" />
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="text-xs text-[#606060]">
                {folder.photo_count ?? 0} foto
              </span>
            </button>
          ))
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