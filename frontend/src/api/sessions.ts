import apiClient from './client'
import type { ApiResponse, PhotoSession } from '@/types'

// ==========================================
// PIXELBOOTH — Photo Session API
// ==========================================

export interface CaptureResult {
  capture: {
    id: number
    session_id: number
    frame_number: number
    photo_path: string
    photo_url: string
    status: string
  }
  session: PhotoSession
  all_done: boolean
}

export const sessionApi = {
  create: async (templateId: number, folderId: number | null = null): Promise<PhotoSession> => {
    const response = await apiClient.post<ApiResponse<PhotoSession>>('/sessions', {
      template_id: templateId,
      folder_id: folderId,
    })
    return response.data.data
  },

  show: async (id: number): Promise<PhotoSession> => {
    const response = await apiClient.get<ApiResponse<PhotoSession>>(`/sessions/${id}`)
    return response.data.data
  },

  capture: async (id: number, imageBase64: string): Promise<CaptureResult> => {
    const response = await apiClient.post<ApiResponse<CaptureResult>>(
      `/sessions/${id}/capture`,
      { image_base64: imageBase64 }
    )
    return response.data.data
  },

  retake: async (id: number, frameNumber: number): Promise<PhotoSession> => {
    const response = await apiClient.post<ApiResponse<PhotoSession>>(`/sessions/${id}/retake`, {
      frame_number: frameNumber,
    })
    return response.data.data
  },

  complete: async (id: number): Promise<{ session: PhotoSession; photo: unknown }> => {
    const response = await apiClient.post<ApiResponse<{ session: PhotoSession; photo: unknown }>>(
      `/sessions/${id}/complete`
    )
    return response.data.data
  },

  cancel: async (id: number): Promise<void> => {
    await apiClient.post(`/sessions/${id}/cancel`)
  },

  setFolder: async (id: number, folderId: number | null): Promise<PhotoSession> => {
    const response = await apiClient.post<ApiResponse<PhotoSession>>(`/sessions/${id}/set-folder`, {
      folder_id: folderId,
    })
    return response.data.data
  },
}