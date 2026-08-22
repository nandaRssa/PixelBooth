// ==========================================
// PIXELBOOTH — Download file lintas origin
// Browser mengabaikan atribut `download` untuk URL
// lintas domain — wajib lewat Blob agar file langsung
// terunduh. Fallback: buka tab baru bila fetch gagal.
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
