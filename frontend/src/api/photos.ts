import apiClient from './client'
import type { ApiResponse, PaginatedResponse, Photo } from '@/types'

// ==========================================
// PIXELBOOTH — Photos API
// ==========================================

export interface PhotoListParams {
  folder_id?: number | null
  page?: number
}

export const photoApi = {
  list: async (params: PhotoListParams = {}): Promise<PaginatedResponse<Photo>> => {
    const response = await apiClient.get<PaginatedResponse<Photo>>('/photos', { params })
    return response.data
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/photos/${id}`)
  },

  move: async (id: number, folderId: number): Promise<Photo> => {
    const response = await apiClient.post<ApiResponse<Photo>>(`/photos/${id}/move`, {
      folder_id: folderId,
    })
    return response.data.data
  },
}