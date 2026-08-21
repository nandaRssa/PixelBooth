import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutGrid,
  Camera,
  Layers,
  Moon,
  Settings,
  Sun,
} from 'lucide-react'
import { getTheme, setTheme, type ThemeMode } from '@/utils/theme'

// ==========================================
// Admin Layout — Sidebar + Main Content
// ==========================================

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

const navItems: NavItem[] = [
  { to: '/gallery', icon: <LayoutGrid size={20} />, label: 'Galeri' },
  { to: '/photo', icon: <Camera size={20} />, label: 'Photo' },
  { to: '/templates', icon: <Layers size={20} />, label: 'Kelola Template' },
]

export const AdminLayout: React.FC = () => {
  const [theme, setThemeState] = React.useState<ThemeMode>(getTheme)

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="min-h-screen bg-pb-bg flex">
      {/* Sidebar — rail ikon di layar sempit (iPad portrait), penuh di desktop */}
      <aside className="w-16 lg:w-64 bg-pb-bg border-r border-pb-border flex flex-col fixed h-full z-10 transition-[width] duration-200">
        {/* Logo */}
        <div className="px-3 lg:px-6 py-6 border-b border-pb-border">
          <div className="flex items-center justify-center lg:justify-between gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg shrink-0
                text-pb-text-secondary hover:text-pb-text hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="hidden lg:block min-w-0">
              <h1 className="text-pb-text font-bold text-lg tracking-tight">
                Pixel<span className="text-pb-text-secondary">Booth</span>
              </h1>
              <p className="text-pb-text-muted text-xs mt-0.5">Sistem Photobooth Profesional</p>
            </div>
            {/* Mode rail: ikon logo + toggle */}
            <span className="lg:hidden text-pb-text font-bold text-lg">PB</span>
          </div>
          {/* Toggle untuk rail mode */}
          <div className="flex justify-center mt-3 lg:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              className="flex items-center justify-center w-9 h-9 rounded-lg
                text-pb-text-secondary hover:text-pb-text hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 lg:px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) => `
                flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-200 group hover:translate-x-1.5
                ${isActive
                  ? 'bg-gradient-to-r from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/25'
                  : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'
                }
              `}
            >
              {item.icon}
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 lg:px-3 py-4 border-t border-pb-border">
          <NavLink
            to="/settings"
            title="Pengaturan"
            className={({ isActive }) => `
              flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold
              transition-all duration-200 hover:translate-x-1.5
              ${isActive ? 'bg-gradient-to-r from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/25' : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'}
            `}
          >
            <Settings size={20} />
            <span className="hidden lg:inline">Pengaturan</span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-16 lg:ml-64 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-8"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}