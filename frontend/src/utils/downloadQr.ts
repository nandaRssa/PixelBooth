// ==========================================
// PIXELBOOTH — Utility unduh QR sebagai PNG
// ==========================================

/**
 * Unduh QR code sebagai file PNG beresolusi tinggi (1000x1000).
 * Mengambil langsung dari elemen SVG di halaman jika tersedia.
 */
export async function downloadQrCode(
  svgElementId: string,
  fallbackUrl: string,
  filename: string
): Promise<void> {
  const qrSvg = document.getElementById(svgElementId) as SVGSVGElement | null
  if (qrSvg) {
    const svgData = new XMLSerializer().serializeToString(qrSvg)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1000
      canvas.height = 1000
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 60, 60, 880, 880)
        canvas.toBlob((pngBlob) => {
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
          URL.revokeObjectURL(blobUrl)
        }, 'image/png')
      }
    }
    img.src = blobUrl
    return
  }

  // Fallback jika SVG element id tidak ditemukan
  if (fallbackUrl) {
    await downloadSvgAsPng(fallbackUrl, filename)
  }
}

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