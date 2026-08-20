import apiClient from './client'
import type { ApiResponse, Folder } from '@/types'

// ==========================================
// PIXELBOOTH — Folders API
// ==========================================

export interface FolderPayload {
  name: string
  parent_folder_id?: number | null
}

export const folderApi = {
  list: async (parentId?: number | null): Promise<Folder[]> => {
    const params = parentId ? { parent_id: parentId } : {}
    const response = await apiClient.get<ApiResponse<Folder[]>>('/folders', { params })
    return response.data.data
  },

  show: async (id: number): Promise<Folder> => {
    const response = await apiClient.get<ApiResponse<Folder>>(`/folders/${id}`)
    return response.data.data
  },

  create: async (payload: FolderPayload): Promise<Folder> => {
    const response = await apiClient.post<ApiResponse<Folder>>('/folders', payload)
    return response.data.data
  },

  update: async (id: number, payload: FolderPayload): Promise<Folder> => {
    const response = await apiClient.put<ApiResponse<Folder>>(`/folders/${id}`, payload)
    return response.data.data
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/folders/${id}`)
  },
}