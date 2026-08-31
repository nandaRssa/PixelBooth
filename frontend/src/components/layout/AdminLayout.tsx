import React from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home,
  LayoutGrid,
  Camera,
  Layers,
  Moon,
  Settings,
  Sun,
} from 'lucide-react'
import { getTheme, setTheme, type ThemeMode } from '@/utils/theme'

// ==========================================
// Admin Layout — Retro Arcade Style
// Sidebar + Main Content
// ==========================================

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

const navItems: NavItem[] = [
  { to: '/', icon: <Home size={18} />, label: 'Dashboard' },
  { to: '/gallery', icon: <LayoutGrid size={18} />, label: 'Galeri' },
  { to: '/photo', icon: <Camera size={18} />, label: 'Photo' },
  { to: '/templates', icon: <Layers size={18} />, label: 'Template' },
]

export const AdminLayout: React.FC = () => {
  const [theme, setThemeState] = React.useState<ThemeMode>(getTheme)
  const location = useLocation()
  const isEditorPage = location.pathname.includes('/editor')

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="min-h-screen w-full relative">
      {/* ===== Mobile Top Header (< lg) ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[var(--pb-bg)] border-b-[3px] border-[#FF5E00] flex items-center justify-between px-4 z-30">
        <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
          <img
            src={theme === 'dark' ? '/logo-spot-white.png' : '/logo-spot.png'}
            alt="SPOT"
            className="h-8 w-auto object-contain"
          />
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
          title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
          className="flex items-center justify-center w-9 h-9 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:border-[#FF5A36] transition-colors shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      {/* ===== Desktop Sidebar (lg+) ===== */}
      <aside className="hidden lg:flex w-72 bg-[var(--pb-bg)] border-r-[3px] border-[#FF5E00] flex-col fixed inset-y-0 top-0 bottom-0 left-0 h-screen h-[100dvh] z-20 overflow-y-auto">
        {/* Logo */}
        <div className="px-6 py-6 border-b-[2px] border-[var(--pb-border)] shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              title={theme === 'dark' ? 'Mode siang' : 'Mode malam'}
              className="flex items-center justify-center w-9 h-9 rounded-[4px] shrink-0
                border-[2px] border-[var(--pb-border-strong)] bg-[var(--pb-elevated)]
                text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] hover:border-[#FF5A36]
                transition-colors shadow-[2px_2px_0px_var(--pb-shadow-solid)]
                active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link to="/" className="min-w-0 flex-1 ml-2.5 block group">
              <img
                src={theme === 'dark' ? '/logo-spot-white.png' : '/logo-spot.png'}
                alt="SPOT"
                className="h-10 xl:h-11 w-auto object-contain group-hover:opacity-80 transition-opacity"
              />
              <p className="font-retro text-[var(--pb-text-muted)] text-base mt-1.5 font-bold">Sistema Photobooth_</p>
            </Link>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-5 space-y-2.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
              title={item.label}
              className={({ isActive }) => `
                flex items-center gap-3.5 px-5 py-3.5 text-xl font-retro tracking-wider uppercase
                transition-all duration-100 border-[2px] rounded-[4px]
                ${isActive
                  ? 'bg-[#FF5A36] text-white border-black shadow-[3px_3px_0px_var(--pb-shadow-solid)] translate-x-1 font-bold'
                  : 'bg-transparent text-[var(--pb-text-secondary)] border-transparent hover:bg-[var(--pb-elevated)] hover:text-[var(--pb-text)] hover:border-[var(--pb-border-strong)] hover:translate-x-1.5'
                }
              `}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-5 border-t-[2px] border-[var(--pb-border)] shrink-0 mt-auto">
          <NavLink
            to="/settings"
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
            title="Pengaturan"
            className={({ isActive }) => `
              flex items-center gap-3.5 px-5 py-3.5 text-xl font-retro tracking-wider uppercase
              transition-all duration-100 border-[2px] rounded-[4px]
              ${isActive
                ? 'bg-[#FF5A36] text-white border-black shadow-[3px_3px_0px_var(--pb-shadow-solid)] translate-x-1 font-bold'
                : 'bg-transparent text-[var(--pb-text-secondary)] border-transparent hover:bg-[var(--pb-elevated)] hover:text-[var(--pb-text)] hover:border-[var(--pb-border-strong)] hover:translate-x-1.5'
              }
            `}
          >
            <Settings size={22} />
            <span>Pengaturan</span>
          </NavLink>
        </div>
      </aside>

      {/* ===== Main Content Area ===== */}
      <main className={`lg:pl-72 min-h-screen min-h-[100dvh] ${isEditorPage ? 'pt-16 lg:pt-0 pb-6 lg:pb-0' : 'pt-16 lg:pt-0 pb-20 lg:pb-0'} w-full flex flex-col`}>
        <div className={`w-full max-w-6xl xl:max-w-7xl mx-auto ${isEditorPage ? 'p-3 sm:p-5 lg:p-8' : 'p-5 sm:p-7 lg:p-8'} animate-pixel-fade-in flex-1 flex flex-col`}>
          <Outlet />
        </div>
      </main>

      {/* ===== Mobile Bottom Navigation Bar (< lg) - Hidden on Editor ===== */}
      {!isEditorPage && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--pb-surface)] border-t-[3px] border-[#FF5E00] flex items-center justify-around px-4 z-30 h-[60px]">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
              title={item.label}
              aria-label={item.label}
              className="flex items-center justify-center flex-1 py-1 transition-all"
            >
              {({ isActive }) => (
                <div
                  className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-all border-[2px] ${
                    isActive
                      ? 'bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]'
                      : 'bg-transparent text-[var(--pb-text-muted)] border-transparent hover:text-[var(--pb-text)] hover:bg-[var(--pb-elevated)] hover:border-[var(--pb-border-strong)]'
                  }`}
                >
                  {item.icon}
                </div>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
            title="Pengaturan"
            aria-label="Pengaturan"
            className="flex items-center justify-center flex-1 py-1 transition-all"
          >
            {({ isActive }) => (
              <div
                className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-all border-[2px] ${
                  isActive
                    ? 'bg-[#FF5A36] text-white border-black shadow-[2px_2px_0px_#000]'
                    : 'bg-transparent text-[var(--pb-text-muted)] border-transparent hover:text-[var(--pb-text)] hover:bg-[var(--pb-elevated)] hover:border-[var(--pb-border-strong)]'
                }`}
              >
                <Settings size={18} />
              </div>
            )}
          </NavLink>
        </nav>
      )}
    </div>
  )
}