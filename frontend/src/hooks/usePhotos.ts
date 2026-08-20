import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { photoApi, type PhotoListParams } from '@/api/photos'

// ==========================================
// PIXELBOOTH — Photo Query Hooks
// ==========================================

const PHOTO_KEYS = {
  list: (folderId?: number | null) => ['photos', 'list', folderId ?? 'all'] as const,
}

export function usePhotos(folderId?: number | null) {
  return useInfiniteQuery({
    queryKey: PHOTO_KEYS.list(folderId),
    queryFn: ({ pageParam = 1 }) =>
      photoApi.list({ folder_id: folderId ?? null, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
  })
}

export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => photoApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useMovePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, folderId }: { id: number; folderId: number }) =>
      photoApi.move(id, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useBulkDeletePhotos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (photoIds: number[]) => photoApi.bulkRemove(photoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useBulkMovePhotos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ photoIds, folderId }: { photoIds: number[]; folderId: number }) =>
      photoApi.bulkMove(photoIds, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export type { PhotoListParams }