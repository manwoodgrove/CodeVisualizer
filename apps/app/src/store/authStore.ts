import { create } from 'zustand'
import { api } from '../api/client.js'

interface AuthUser {
  login: string
  avatarUrl: string
  name?: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  refresh: async () => {
    set({ loading: true })
    try {
      const data = await api.me()
      set({ user: data.authenticated && data.user ? data.user : null, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  logout: async () => {
    try {
      await api.logout()
    } finally {
      set({ user: null })
    }
  },
}))
