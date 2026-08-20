import { useMutation } from '@tanstack/react-query'
import { sessionApi } from '@/api/sessions'

// ==========================================
// Photo Session Hooks
// ==========================================

export function useCreateSession() {
  return useMutation({
    mutationFn: ({ templateId, folderId }: { templateId: number; folderId: number | null }) =>
      sessionApi.create(templateId, folderId),
  })
}

export { sessionApi }