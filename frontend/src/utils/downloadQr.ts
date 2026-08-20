// ==========================================
// PIXELBOOTH — Utility unduh QR sebagai PNG
// ==========================================

/**
 * Ambil SVG QR (via URL relatif) lalu rasterisasi ke PNG berkualitas tinggi.
 */
export async function downloadSvgAsPng(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Gagal memuat QR')
  const svgText = await res.text()

  const blob = new Blob([svgText], { type: 'image/svg+xml' })
  const svgUrl = URL.createObjectURL(blob)

  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(svgUrl)
      return
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (pngBlob) => {
        if (pngBlob) {
          const pngUrl = URL.createObjectURL(pngBlob)
          const a = document.createElement('a')
          a.href = pngUrl
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(pngUrl), 2000)
        }
        URL.revokeObjectURL(svgUrl)
      },
      'image/png'
    )
  }
  img.onerror = () => URL.revokeObjectURL(svgUrl)
  img.src = svgUrl
}