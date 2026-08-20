import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { folderApi, type FolderPayload } from '@/api/folders'

// ==========================================
// PIXELBOOTH — Folder Query Hooks
// ==========================================

const FOLDER_KEYS = {
  list: (parentId?: number | null) => ['folders', 'list', parentId ?? 'root'] as const,
}

export function useFolders(parentId?: number | null) {
  return useQuery({
    queryKey: FOLDER_KEYS.list(parentId),
    queryFn: () => folderApi.list(parentId),
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: FolderPayload) => folderApi.create(payload),
    onSuccess: (_data, variables) => {
      const parentId = variables.parent_folder_id ?? null
      queryClient.invalidateQueries({ queryKey: FOLDER_KEYS.list(parentId) })
      queryClient.invalidateQueries({ queryKey: FOLDER_KEYS.list(null) })
    },
  })
}

export function useUpdateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FolderPayload }) =>
      folderApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => folderApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}