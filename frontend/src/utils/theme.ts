// ==========================================
// Theme Mode — gelap (default brand) / terang
// Kelas "light" dipasang di <html> sehingga
// seluruh halaman admin & customer ikut berubah.
// ==========================================

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'pb-theme'

export const getTheme = (): ThemeMode =>
  localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'

export const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('light', mode === 'light')
}

export const setTheme = (mode: ThemeMode) => {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
}
