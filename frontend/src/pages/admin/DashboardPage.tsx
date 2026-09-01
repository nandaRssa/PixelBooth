import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Camera, Layers, Folder, Image, Sparkles } from 'lucide-react'
import { photoApi } from '@/api/photos'
import { useFolders } from '@/hooks/useFolders'
import { useTemplates } from '@/hooks/useTemplates'

// ==========================================
// Dashboard / Home Page
// ==========================================

const menuItems = [
  {
    to: '/gallery',
    icon: LayoutGrid,
    title: 'Galeri',
    description: 'Kelola folder dan foto. Preview, move, delete, dan akses QR code.',
  },
  {
    to: '/photo',
    icon: Camera,
    title: 'Photo',
    description: 'Mulai sesi pemotretan dengan template pilihan dan kamera DSLR.',
  },
  {
    to: '/templates',
    icon: Layers,
    title: 'Kelola Template',
    description: 'Upload, edit frame, dan atur template untuk sesi pemotretan.',
  },
]

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Selamat Pagi' : hour < 17 ? 'Selamat Siang' : 'Selamat Malam'

  // Sinkronisasi data real-time dari backend
  const { data: photosData, isLoading: photosLoading } = useQuery({
    queryKey: ['photos', 'total-count'],
    queryFn: () => photoApi.list({ page: 1 }),
    staleTime: 1000 * 30,
  })
  const { data: folders = [], isLoading: foldersLoading } = useFolders()
  const { data: templates = [], isLoading: templatesLoading } = useTemplates()

  const totalPhotos = photosLoading ? '...' : (photosData?.total ?? 0)
  const totalFolders = foldersLoading ? '...' : folders.length
  const totalTemplates = templatesLoading
    ? '...'
    : templates.filter((t) => t.status === 'active' || !t.status).length

  const stats = [
    {
      label: 'Total Foto',
      value: totalPhotos,
      icon: Image,
      to: '/gallery',
      subtext: 'Foto tersimpan di galeri',
      color: 'text-orange-400',
    },
    {
      label: 'Total Folder',
      value: totalFolders,
      icon: Folder,
      to: '/gallery',
      subtext: 'Folder album galeri',
      color: 'text-cyan-400',
    },
    {
      label: 'Template Aktif',
      value: totalTemplates,
      icon: Sparkles,
      to: '/templates',
      subtext: 'Template siap pakai',
      color: 'text-emerald-400',
    },
  ]

  return (
    <div className="w-full pb-10">
      {/* ===== Header ===== */}
      <div className="mb-6 sm:mb-8 animate-pixel-fade-in">
        {/* Blinking greeting */}
        <p className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base lg:text-lg mb-1 tracking-wider uppercase flex items-center gap-2">
          <span className="animate-blink text-[#FF5A36] text-lg">▶</span> {greeting},
        </p>
        <h1 className="font-pixel text-[var(--pb-text)] text-lg sm:text-2xl lg:text-3xl leading-relaxed tracking-wide">
          Pixel<span className="text-[#FF5A36]">Booth</span>
          <span className="animate-blink ml-1.5 text-[#FFB800]">_</span>
        </h1>
        <p className="font-retro text-[var(--pb-text-secondary)] text-lg sm:text-xl lg:text-2xl mt-2 tracking-wide">
          Apa yang ingin dikelola hari ini?
        </p>
      </div>

      {/* ===== Main Menu Cards ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className="
                relative text-left
                p-5 sm:p-6 lg:p-6
                bg-[var(--pb-surface)]
                border-[3px] border-[var(--pb-border-strong)]
                rounded-[4px]
                cursor-pointer group
                overflow-hidden
                shadow-[3px_3px_0px_#000000,6px_6px_0px_#FF5E00]
                hover:shadow-[5px_5px_0px_#000000,10px_10px_0px_#FF5E00]
                hover:border-[#FFB800]
                hover:-translate-x-1 hover:-translate-y-1
                active:translate-x-1 active:translate-y-1
                active:shadow-[1px_1px_0px_#000000,2px_2px_0px_#FF5E00]
                transition-all duration-150 ease-out
              "
            >
              {/* Top gradient highlight strip */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF5A36] via-[#FFB800] to-[#00FFCC] opacity-80 group-hover:opacity-100 transition-opacity" />

              {/* Decorative arcade corner LED */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-none bg-[#FF5A36] group-hover:bg-[#00FFCC] group-hover:shadow-[0_0_8px_#00FFCC] transition-all duration-150" />
                <span className="w-1.5 h-1.5 rounded-none bg-[var(--pb-border)] group-hover:bg-[#FFB800] transition-all duration-150" />
              </div>

              {/* Icon box */}
              <div className="w-12 h-12 lg:w-14 lg:h-14 bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] flex items-center justify-center mb-4 shadow-[2px_2px_0px_#000000] group-hover:border-[#FFB800] group-hover:bg-[#251200] group-hover:scale-105 transition-all duration-150">
                <Icon size={22} className="text-[#FF5A36] group-hover:text-[#FFB800] group-hover:rotate-6 transition-all duration-150" />
              </div>

              {/* Content */}
              <h2 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm leading-relaxed mb-2 group-hover:text-[#FFB800] transition-colors">
                {item.title}
              </h2>
              <p className="font-retro text-[var(--pb-text-muted)] group-hover:text-[var(--pb-text)] text-base sm:text-lg lg:text-xl leading-snug transition-colors">
                {item.description}
              </p>

              {/* Retro footer action */}
              <div className="flex items-center gap-1.5 mt-5 pt-3.5 border-t-[2px] border-dashed border-[var(--pb-border)] font-retro text-[var(--pb-faint)] group-hover:text-[#FFB800] group-hover:border-[#FF5A36]/60 transition-all uppercase tracking-widest text-sm sm:text-base">
                <span className="group-hover:translate-x-1.5 transition-transform duration-150 font-bold">&gt;&gt;</span>
                <span className="group-hover:translate-x-1 transition-transform duration-150">BUKA</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ===== Quick Stats — Scoreboard style ===== */}
      <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {stats.map((stat) => {
          const StatIcon = stat.icon
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => navigate(stat.to)}
              className="
                relative text-left
                bg-[var(--pb-surface)]
                border-[3px] border-[var(--pb-border-strong)]
                rounded-[4px]
                p-4 sm:p-5 lg:p-6
                cursor-pointer group
                overflow-hidden
                shadow-[3px_3px_0px_#000000,6px_6px_0px_#FF5E00]
                hover:shadow-[5px_5px_0px_#000000,10px_10px_0px_#FF5E00]
                hover:border-[#FFB800]
                hover:-translate-x-1 hover:-translate-y-1
                active:translate-x-1 active:translate-y-1
                active:shadow-[1px_1px_0px_#000000,2px_2px_0px_#FF5E00]
                transition-all duration-150 ease-out
              "
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <p className="font-retro text-[var(--pb-text-muted)] group-hover:text-[var(--pb-text-secondary)] text-sm sm:text-base lg:text-lg uppercase tracking-wider transition-colors font-bold">
                  {stat.label}
                </p>
                <div className={`p-1.5 rounded-[3px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] group-hover:border-[#FFB800] group-hover:scale-110 transition-all duration-150 ${stat.color}`}>
                  <StatIcon size={16} />
                </div>
              </div>

              {/* Number — Scoreboard counter */}
              <p className="font-retro text-[var(--pb-text)] group-hover:text-[#FFB800] text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-2 group-hover:scale-[1.02] transition-all origin-left">
                {stat.value}
              </p>

              {/* Scoreboard lines decoration */}
              <div className="flex flex-col gap-1 mb-2.5">
                <div className="h-[2.5px] bg-[var(--pb-border-strong)] group-hover:bg-[#FF5A36] w-full transition-colors" />
                <div className="h-[1.5px] bg-[var(--pb-border-light)] group-hover:bg-[#FFB800] w-3/4 transition-colors" />
                <div className="h-[1px] bg-[var(--pb-border)] group-hover:bg-[#00FFCC] w-1/2 transition-colors" />
              </div>

              <p className="font-retro text-[var(--pb-text-muted)] group-hover:text-[var(--pb-text)] text-sm sm:text-base truncate transition-colors">
                {stat.subtext}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DashboardPage
