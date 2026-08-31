import { useState, useEffect, useCallback } from 'react'
import {
  getAvailableCameraDevices,
  getSelectedCameraId,
  setSelectedCameraId as saveSelectedCameraId,
  type CameraDeviceInfo,
} from '@/utils/cameraManager'
import { toast } from '@/components/ui/Toast'

export function useCameraDevices() {
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(() => getSelectedCameraId())
  const [isLoading, setIsLoading] = useState(true)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const refreshDevices = useCallback(async (notifyOnNew = false) => {
    setIsLoading(true)
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setDevices([])
        setHasPermission(false)
        setIsLoading(false)
        return
      }

      let cameraList = await getAvailableCameraDevices()

      // Jika label masih kosong (artinya izin kamera belum diberikan sebelumnya)
      if (cameraList.length > 0 && cameraList.some((d) => !d.label || d.label.startsWith('Kamera '))) {
        try {
          // Trigger permintaan izin kamera ringan agar label terbaca
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          tempStream.getTracks().forEach((track) => track.stop())
          // Ambil ulang dengan label yang sudah terbuka
          cameraList = await getAvailableCameraDevices()
          setHasPermission(true)
        } catch {
          // User menolak izin atau kamera sedang dipakai aplikasi lain
          setHasPermission(false)
        }
      } else if (cameraList.length > 0) {
        setHasPermission(true)
      } else {
        setHasPermission(false)
      }

      setDevices((prev) => {
        if (notifyOnNew && prev.length > 0 && cameraList.length > prev.length) {
          const newDev = cameraList.find((c) => !prev.some((p) => p.deviceId === c.deviceId))
          if (newDev) {
            toast.success(`Kamera baru terdeteksi: ${newDev.label}`)
          }
        }
        return cameraList
      })

      // Jika ada selectedDeviceId tapi device-nya sudah tidak ada di list
      const currentStored = getSelectedCameraId()
      if (currentStored && cameraList.length > 0) {
        const stillExists = cameraList.some((d) => d.deviceId === currentStored)
        if (!stillExists) {
          // Fallback ke kamera pertama
          setSelectedDeviceIdState(cameraList[0].deviceId)
          saveSelectedCameraId(cameraList[0].deviceId)
        }
      } else if (!currentStored && cameraList.length > 0) {
        setSelectedDeviceIdState(cameraList[0].deviceId)
        saveSelectedCameraId(cameraList[0].deviceId)
      }
    } catch (err) {
      console.error('Error saat refresh daftar kamera:', err)
      setHasPermission(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setCamera = useCallback((deviceId: string) => {
    setSelectedDeviceIdState(deviceId)
    saveSelectedCameraId(deviceId)
  }, [])

  useEffect(() => {
    refreshDevices()

    // Listener otomatis ketika kabel USB dicolok atau dicabut
    const handleDeviceChange = () => {
      refreshDevices(true)
    }

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [refreshDevices])

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId: setCamera,
    refreshDevices,
    isLoading,
    hasPermission,
  }
}
