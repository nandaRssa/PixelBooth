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
      {/* Sidebar */}
      <aside className="w-64 bg-pb-bg border-r border-pb-border flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-pb-border">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-pb-text font-bold text-lg tracking-tight">
                Pixel<span className="text-pb-text-secondary">Booth</span>
              </h1>
              <p className="text-pb-text-muted text-xs mt-0.5">Sistem Photobooth Profesional</p>
            </div>
            {/* Toggle Mode Siang/Malam */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0
                text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-pb-accent text-pb-on-accent'
                  : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'
                }
              `}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-pb-border">
          <NavLink
            to="/settings"
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-all duration-150
              ${isActive ? 'bg-pb-accent text-pb-on-accent' : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'}
            `}
          >
            <Settings size={20} />
            Pengaturan
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
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