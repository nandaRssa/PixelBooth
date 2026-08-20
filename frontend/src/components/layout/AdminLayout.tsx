import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutGrid,
  Camera,
  Layers,
  Settings,
} from 'lucide-react'

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
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0D0D0D] border-r border-[#1A1A1A] flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-[#1A1A1A]">
          <h1 className="text-white font-bold text-lg tracking-tight">
            Pixel<span className="text-[#A0A0A0]">Booth</span>
          </h1>
          <p className="text-[#606060] text-xs mt-0.5">Sistem Photobooth Profesional</p>
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
                  ? 'bg-white text-black'
                  : 'text-[#A0A0A0] hover:text-white hover:bg-white/5'
                }
              `}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-[#1A1A1A]">
          <NavLink
            to="/settings"
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-all duration-150
              ${isActive ? 'bg-white text-black' : 'text-[#A0A0A0] hover:text-white hover:bg-white/5'}
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