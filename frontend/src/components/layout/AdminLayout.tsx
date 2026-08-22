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
    <div className="min-h-screen bg-pb-bg flex flex-col lg:flex-row">
      {/* ===== Mobile Top Header (< lg) ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-pb-bg/90 backdrop-blur-md border-b border-pb-border flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF5A36] to-[#FF8836] flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-orange-500/30">
            PB
          </span>
          <h1 className="text-pb-text font-bold text-base tracking-tight">
            Pixel<span className="text-[#FF5A36]">Booth</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
          title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-pb-surface border border-pb-border text-pb-text-secondary hover:text-pb-text transition-colors"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      {/* ===== Desktop Sidebar (lg+) ===== */}
      <aside className="hidden lg:flex w-64 bg-pb-bg border-r border-pb-border flex-col fixed h-full z-20">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-pb-border">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0
                text-pb-text-secondary hover:text-pb-text hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="min-w-0 flex-1 ml-2">
              <h1 className="text-pb-text font-bold text-lg tracking-tight">
                Pixel<span className="text-[#FF5A36]">Booth</span>
              </h1>
              <p className="text-pb-text-muted text-xs mt-0.5">Sistem Photobooth Profesional</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) => `
                flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-200 group hover:translate-x-1.5
                ${isActive
                  ? 'bg-gradient-to-r from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/25'
                  : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'
                }
              `}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-pb-border">
          <NavLink
            to="/settings"
            title="Pengaturan"
            className={({ isActive }) => `
              flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold
              transition-all duration-200 hover:translate-x-1.5
              ${isActive ? 'bg-gradient-to-r from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/25' : 'text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated'}
            `}
          >
            <Settings size={20} />
            <span>Pengaturan</span>
          </NavLink>
        </div>
      </aside>

      {/* ===== Main Content Area ===== */}
      <main className="flex-1 w-full lg:ml-64 min-h-screen pt-16 lg:pt-0 pb-20 lg:pb-0">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* ===== Mobile Bottom Navigation Bar (< lg) ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-15 bg-pb-surface/95 backdrop-blur-lg border-t border-pb-border flex items-center justify-around px-4 z-30 shadow-lg">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            aria-label={item.label}
            className="flex items-center justify-center flex-1 py-1 transition-all"
          >
            {({ isActive }) => (
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-gradient-to-tr from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/30 scale-105'
                    : 'text-pb-text-muted hover:text-pb-text hover:bg-pb-elevated'
                }`}
              >
                {item.icon}
              </div>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          title="Pengaturan"
          aria-label="Pengaturan"
          className="flex items-center justify-center flex-1 py-1 transition-all"
        >
          {({ isActive }) => (
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-gradient-to-tr from-[#FF5A36] to-[#FF8836] text-white shadow-md shadow-orange-500/30 scale-105'
                  : 'text-pb-text-muted hover:text-pb-text hover:bg-pb-elevated'
              }`}
            >
              <Settings size={20} />
            </div>
          )}
        </NavLink>
      </nav>
    </div>
  )
}