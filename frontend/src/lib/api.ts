import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        try {
          const res = await axios.post('/api/auth/refresh-token', { refresh_token: refreshToken })
          const { access_token, refresh_token } = res.data
          useAuthStore.getState().setTokens(access_token, refresh_token)
          original.headers.Authorization = `Bearer ${access_token}`
          return api(original)
        } catch {
          useAuthStore.getState().logout()
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Auth
export const authApi = {
  signup: (data: object) => api.post('/auth/signup', data),
  login: (data: object) => api.post('/auth/login', data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refresh_token: refreshToken }),
  me: () => api.get('/auth/me'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
}

// Public
export const publicApi = {
  plans: () => api.get('/public/subscription-plans'),
  shop: (slug: string) => api.get(`/public/shop/${slug}`),
}

// Services
export const servicesApi = {
  list: (params?: object) => api.get('/services', { params }),
  create: (data: object) => api.post('/services', data),
  update: (id: string, data: object) => api.put(`/services/${id}`, data),
  delete: (id: string) => api.delete(`/services/${id}`),
  packages: {
    list: (params?: object) => api.get('/services/packages', { params }),
    create: (data: object) => api.post('/services/packages', data),
    update: (id: string, data: object) => api.put(`/services/packages/${id}`, data),
    delete: (id: string) => api.delete(`/services/packages/${id}`),
  },
}

// Customers
export const customersApi = {
  list: (params?: object) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: object) => api.post('/customers', data),
  update: (id: string, data: object) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
}

// Appointments
export const appointmentsApi = {
  list: (params?: object) => api.get('/appointments', { params }),
  calendar: (date: string) => api.get(`/appointments/calendar/${date}`),
  get: (id: string) => api.get(`/appointments/${id}`),
  create: (data: object) => api.post('/appointments', data),
  update: (id: string, data: object) => api.put(`/appointments/${id}`, data),
  cancel: (id: string) => api.delete(`/appointments/${id}`),
}

// Accounting
export const accountingApi = {
  invoices: {
    list: (params?: object) => api.get('/invoices', { params }),
    get: (id: string) => api.get(`/invoices/${id}`),
    create: (data: object) => api.post('/invoices', data),
    update: (id: string, data: object) => api.put(`/invoices/${id}`, data),
    delete: (id: string) => api.delete(`/invoices/${id}`),
  },
  payments: {
    list: (params?: object) => api.get('/payments', { params }),
    create: (data: object) => api.post('/payments', data),
  },
  debts: {
    list: (params?: object) => api.get('/debts', { params }),
    byCustomer: (customerId: string) => api.get(`/debts/${customerId}`),
  },
  reports: {
    revenue: (period?: string) => api.get('/reports/revenue', { params: { period } }),
    services: () => api.get('/reports/services'),
    customers: () => api.get('/reports/customers'),
    debtAging: () => api.get('/reports/debt-aging'),
  },
  stats: () => api.get('/stats'),
}

// Settings
export const settingsApi = {
  getShop: () => api.get('/settings/shop'),
  updateShop: (data: object) => api.put('/settings/shop', data),
  updatePassword: (data: object) => api.put('/settings/password', data),
  upgradePlan: (planId: string) => api.post('/settings/upgrade-plan', { plan_id: planId }),
  staff: {
    list: () => api.get('/settings/staff'),
    create: (data: object) => api.post('/settings/staff', data),
  },
}

// Expenses
export const expensesApi = {
  list: (params?: object) => api.get('/expenses', { params }),
  create: (data: object) => api.post('/expenses', data),
  update: (id: string, data: object) => api.put(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
  summary: (period?: string) => api.get('/reports/profit-summary', { params: { period } }),
}

// Admin
export const adminApi = {
  shops: {
    list: (params?: object) => api.get('/admin/shops', { params }),
    get: (id: string) => api.get(`/admin/shops/${id}`),
    update: (id: string, data: object) => api.put(`/admin/shops/${id}`, data),
    delete: (id: string) => api.delete(`/admin/shops/${id}`),
    suspend: (id: string) => api.post(`/admin/shops/${id}/suspend`),
    unsuspend: (id: string) => api.post(`/admin/shops/${id}/unsuspend`),
  },
  plans: {
    list: () => api.get('/admin/subscription-plans'),
    create: (data: object) => api.post('/admin/subscription-plans', data),
    update: (id: string, data: object) => api.put(`/admin/subscription-plans/${id}`, data),
    delete: (id: string) => api.delete(`/admin/subscription-plans/${id}`),
  },
  billing: {
    list: (params?: object) => api.get('/admin/billing-records', { params }),
    trigger: (data: object) => api.post('/admin/billing-records/trigger', data),
  },
  analytics: () => api.get('/admin/analytics'),
}
