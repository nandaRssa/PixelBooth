import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Camera, Layers, ArrowRight, Folder, Image, Sparkles } from 'lucide-react'
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
    <div className="max-w-4xl mx-auto pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 sm:mb-10"
      >
        <p className="text-pb-text-muted text-xs sm:text-sm mb-1">{greeting},</p>
        <h1 className="text-pb-text text-2xl sm:text-3xl font-bold tracking-tight">
          Pixel<span className="text-[#FF5A36]">Booth</span>
        </h1>
        <p className="text-pb-text-secondary text-sm sm:text-base mt-1.5">
          Apa yang ingin Anda kelola hari ini?
        </p>
      </motion.div>

      {/* Main Menu Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {menuItems.map((item, index) => {
          const Icon = item.icon
          return (
            <motion.button
              key={item.to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(item.to)}
              className="
                text-left p-6 rounded-2xl bg-pb-surface hover:bg-pb-elevated
                border border-pb-border hover:border-pb-border-strong shadow-xs hover:shadow-xl
                transition-all duration-200 cursor-pointer group
              "
            >
              {/* Icon */}
              <div className="w-12 h-12 bg-pb-elevated rounded-xl flex items-center justify-center mb-4 group-hover:bg-pb-border transition-colors">
                <Icon size={22} className="text-pb-text" />
              </div>

              {/* Content */}
              <h2 className="text-pb-text font-semibold text-base mb-2">{item.title}</h2>
              <p className="text-pb-text-muted text-sm leading-relaxed">{item.description}</p>

              {/* Arrow */}
              <div className="flex items-center gap-1 mt-4 text-pb-faint group-hover:text-pb-text-secondary transition-colors">
                <span className="text-xs font-medium">Buka</span>
                <ArrowRight size={12} />
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Synchronized Quick Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4"
      >
        {stats.map((stat) => {
          const StatIcon = stat.icon
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => navigate(stat.to)}
              className="text-left bg-pb-surface border border-pb-border hover:border-pb-border-strong rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all duration-150 cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-pb-text-muted text-xs font-medium">{stat.label}</p>
                <div className={`p-1.5 rounded-lg bg-pb-elevated group-hover:bg-pb-border/50 transition-colors ${stat.color}`}>
                  <StatIcon size={16} />
                </div>
              </div>
              <p className="text-pb-text text-2xl sm:text-3xl font-bold tracking-tight mb-1">
                {stat.value}
              </p>
              <p className="text-pb-text-muted text-[11px] sm:text-xs truncate">
                {stat.subtext}
              </p>
            </button>
          )
        })}
      </motion.div>
    </div>
  )
}

export default DashboardPage
