// ==========================================
// Theme Mode — gelap (default brand) / terang
// Kelas "light" dipasang di <html> sehingga
// seluruh halaman admin & customer ikut berubah.
// ==========================================

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'pb-theme'

export const getTheme = (): ThemeMode =>
  localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'

const THEME_COLORS: Record<ThemeMode, string> = {
  dark: '#0A0A0A',
  light: '#FFFFFF',
}

export const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('light', mode === 'light')
  // Sinkronkan warna chrome browser (status bar iOS, address bar Android)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[mode])
}

export const setTheme = (mode: ThemeMode) => {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
}
