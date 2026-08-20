import apiClient from './client'
import type { ApiResponse, PaginatedResponse, Photo } from '@/types'

// ==========================================
// PIXELBOOTH — Photos API
// ==========================================

export interface PhotoListParams {
  folder_id?: number | null
  uncategorized?: boolean
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

  bulkRemove: async (photoIds: number[]): Promise<void> => {
    await apiClient.post('/photos/bulk-delete', { photo_ids: photoIds })
  },

  // folderId null = pindah ke galeri utama (tanpa folder)
  move: async (id: number, folderId: number | null): Promise<Photo> => {
    const response = await apiClient.post<ApiResponse<Photo>>(`/photos/${id}/move`, {
      folder_id: folderId,
    })
    return response.data.data
  },

  bulkMove: async (photoIds: number[], folderId: number | null): Promise<void> => {
    await apiClient.post('/photos/bulk-move', { photo_ids: photoIds, folder_id: folderId })
  },
}