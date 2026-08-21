import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Camera, Layers, ArrowRight } from 'lucide-react'

// ==========================================
// Dashboard / Home Page
// ==========================================

const menuItems = [
  {
    to: '/gallery',
    icon: LayoutGrid,
    title: 'Galeri',
    description: 'Kelola folder dan foto. Preview, move, delete, dan akses QR code.',
    color: 'from-neutral-800 to-neutral-900',
    accent: '#A0A0A0',
  },
  {
    to: '/photo',
    icon: Camera,
    title: 'Photo',
    description: 'Mulai sesi pemotretan dengan template pilihan dan kamera DSLR.',
    color: 'from-neutral-800 to-neutral-900',
    accent: '#A0A0A0',
  },
  {
    to: '/templates',
    icon: Layers,
    title: 'Kelola Template',
    description: 'Upload, edit frame, dan atur template untuk sesi pemotretan.',
    color: 'from-neutral-800 to-neutral-900',
    accent: '#A0A0A0',
  },
]

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Selamat Pagi' : hour < 17 ? 'Selamat Siang' : 'Selamat Malam'

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <p className="text-pb-text-muted text-sm mb-1">{greeting},</p>
        <h1 className="text-pb-text text-3xl font-bold tracking-tight">
          PixelBooth
        </h1>
        <p className="text-pb-text-secondary text-base mt-2">
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
              className={`
                text-left p-6 rounded-2xl bg-gradient-to-br ${item.color}
                border border-pb-border hover:border-pb-border-strong shadow-xs hover:shadow-xl
                transition-colors duration-200 cursor-pointer group
              `}
            >
              {/* Icon */}
              <div className="w-12 h-12 bg-pb-elevated rounded-xl flex items-center justify-center mb-4 group-hover:bg-pb-border-light transition-colors">
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

      {/* Quick Stats placeholder */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {[
          { label: 'Total Foto', value: '—' },
          { label: 'Total Folder', value: '—' },
          { label: 'Template Aktif', value: '—' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-pb-surface border border-pb-border rounded-xl px-4 py-4"
          >
            <p className="text-pb-text-muted text-xs mb-1">{stat.label}</p>
            <p className="text-pb-text text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default DashboardPage
