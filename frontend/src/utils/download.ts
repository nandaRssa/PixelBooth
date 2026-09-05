// ==========================================
// PIXELBOOTH — Download file lintas origin & Simpan ke Folder Lokal
// Browser mengabaikan atribut `download` untuk URL
// lintas domain — wajib lewat Blob agar file langsung
// terunduh. Fallback: buka tab baru bila fetch gagal.
// Mendukung File System Access API untuk menyimpan
// langsung ke folder komputer lokal pilihan pengguna.
// ==========================================

import { getStorageUrl } from '@/api/client'

export async function downloadFile(url: string, filename: string): Promise<void> {
  const fileUrl = getStorageUrl(url)

  try {
    const res = await fetch(fileUrl, { mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke ditunda — Safari kadang membatalkan unduhan jika langsung di-revoke
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
  } catch {
    // Fallback terakhir: biarkan user menyimpan manual dari tab baru
    window.open(fileUrl, '_blank', 'noopener')
  }
}

/**
 * Menyimpan batch foto langsung ke folder lokal di komputer (misal: "Photobooth First Gathering SPOT 2026")
 * menggunakan File System Access API (Chrome/Edge/Opera).
 */
export async function saveFilesToLocalDirectory(
  files: Array<{ url: string; filename: string }>,
  onProgress?: (index: number, total: number, filename: string) => void
): Promise<{ success: boolean; savedCount: number; dirName?: string }> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('FILE_SYSTEM_API_UNSUPPORTED')
  }

  // Buka dialog pemilihan folder di PC lokal
  const dirHandle = await (window as any).showDirectoryPicker({
    id: 'pixelbooth_local_folder',
    mode: 'readwrite',
    startIn: 'pictures',
  })

  let savedCount = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.(i + 1, files.length, file.filename)

    try {
      const fileUrl = getStorageUrl(file.url)
      const res = await fetch(fileUrl, { mode: 'cors' })
      if (!res.ok) continue
      const blob = await res.blob()

      const fileHandle = await dirHandle.getFileHandle(file.filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      savedCount++
    } catch (e) {
      console.error(`Gagal menyimpan ${file.filename}:`, e)
    }
  }

  return { success: true, savedCount, dirName: dirHandle.name }
}

