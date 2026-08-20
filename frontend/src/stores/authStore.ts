import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

// ==========================================
// Auth Store — Zustand dengan localStorage persistence
// ==========================================

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user: User, token: string) => {
        localStorage.setItem('pixelbooth_token', token)
        set({ user, token, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem('pixelbooth_token')
        localStorage.removeItem('pixelbooth_user')
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user: User) => {
        set({ user })
      },
    }),
    {
      name: 'pixelbooth_auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
