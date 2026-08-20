import apiClient from './client'
import type { Template, ApiResponse } from '@/types'

// ==========================================
// PIXELBOOTH — Templates API
// ==========================================

export interface TemplatePayload {
  name: string
  template_file: File
  preview_file?: File | null
  canvas_width: number
  canvas_height: number
  frame_count: number
  frame_configuration?: string | null
}

function toFormData(payload: TemplatePayload): FormData {
  const form = new FormData()
  form.append('name', payload.name)
  form.append('template_file', payload.template_file)
  if (payload.preview_file) form.append('preview_file', payload.preview_file)
  form.append('canvas_width', String(payload.canvas_width))
  form.append('canvas_height', String(payload.canvas_height))
  form.append('frame_count', String(payload.frame_count))
  if (payload.frame_configuration) {
    form.append('frame_configuration', payload.frame_configuration)
  }
  return form
}

export const templateApi = {
  list: async (): Promise<Template[]> => {
    const response = await apiClient.get<ApiResponse<Template[]>>('/templates')
    return response.data.data
  },

  create: async (payload: TemplatePayload): Promise<Template> => {
    const response = await apiClient.post<ApiResponse<Template>>('/templates', toFormData(payload), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data.data
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/templates/${id}`)
  },

  detectFrames: async (id: number): Promise<Template> => {
    const response = await apiClient.post<ApiResponse<Template>>(`/templates/${id}/detect-frames`)
    return response.data.data
  },
}