import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Construction, Layers } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// ==========================================
// Photo Capture Page — Phase 4 Placeholder
// Alur capture (webcam/DSLR), konfirmasi frame,
// dan komposisi foto final diimplementasikan di Phase 4.
// ==========================================

const PhotoCapturePage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white text-2xl font-bold">Sesi Foto</h1>
          <p className="text-[#606060] text-sm mt-1">Sesi #{id}</p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => navigate('/photo')}
          leftIcon={<ArrowLeft size={16} />}
        >
          Kembali
        </Button>
      </div>

      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-10 text-center">
        <div className="w-16 h-16 bg-[#1E1E1E] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Construction size={28} className="text-[#404040]" />
        </div>
        <h2 className="text-white font-semibold text-base mb-2">
          Halaman Capture dalam Pengembangan
        </h2>
        <p className="text-[#606060] text-sm leading-relaxed max-w-sm mx-auto">
          Alur pengambilan foto — webcam atau DSLR via hardware bridge, konfirmasi tiap frame,
          dan komposisi final sesuai template — akan tersedia di fase berikutnya.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5 text-[#606060] text-xs">
          <Layers size={14} />
          <span>Sesi telah dibuat dan menunggu proses capture.</span>
        </div>
      </div>
    </div>
  )
}

export default PhotoCapturePage