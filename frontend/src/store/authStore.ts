import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'SUPER_ADMIN' | 'SHOP_OWNER' | 'SHOP_STAFF' | 'CUSTOMER'
  shop_id: string | null
  business_name?: string
  subscription_status?: string
  trial_ends_at?: string
  subscription_plan_id?: string | null
  plan_name?: string | null
  plan_price?: number | null
  plan_features?: Record<string, boolean> | null
  max_staff?: number | null
  max_customers?: number | null
  max_appointments_per_month?: number | null
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    { name: 'salon-auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken, isAuthenticated: s.isAuthenticated }) }
  )
)
