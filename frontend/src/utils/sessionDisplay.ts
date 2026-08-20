// ==========================================
// PIXELBOOTH — Konfigurasi tampilan Photo Session
// Disimpan per-device (localStorage), dibaca saat sesi dimulai.
// ==========================================

export type SessionDisplayMode = 'default' | 'fullscreen'

const STORAGE_KEY = 'pb-session-display-mode'

export function getSessionDisplayMode(): SessionDisplayMode {
  return localStorage.getItem(STORAGE_KEY) === 'fullscreen' ? 'fullscreen' : 'default'
}

export function setSessionDisplayMode(mode: SessionDisplayMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
}
