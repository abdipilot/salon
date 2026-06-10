import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { useAuthStore } from '@/store/authStore'

const LandingPage = lazy(() => import('@/pages/landing/LandingPage').then(m => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const ServicesPage = lazy(() => import('@/pages/services/ServicesPage').then(m => ({ default: m.ServicesPage })))
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage').then(m => ({ default: m.CustomersPage })))
const AppointmentsPage = lazy(() => import('@/pages/appointments/AppointmentsPage').then(m => ({ default: m.AppointmentsPage })))
const AccountingPage = lazy(() => import('@/pages/accounting/AccountingPage').then(m => ({ default: m.AccountingPage })))
const POSPage = lazy(() => import('@/pages/pos/POSPage').then(m => ({ default: m.POSPage })))
const SalesPage = lazy(() => import('@/pages/sales/SalesPage').then(m => ({ default: m.SalesPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage').then(m => ({ default: m.AdminAnalyticsPage })))
const AdminShopsPage = lazy(() => import('@/pages/admin/ShopsPage').then(m => ({ default: m.AdminShopsPage })))
const AdminPlansPage = lazy(() => import('@/pages/admin/PlansPage').then(m => ({ default: m.AdminPlansPage })))
const AdminBillingPage = lazy(() => import('@/pages/admin/BillingPage').then(m => ({ default: m.AdminBillingPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function RequireAuth({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) {
    return <Navigate to={adminOnly ? '/admin/login' : '/auth/login'} replace />
  }
  if (adminOnly && user?.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />
  if (!adminOnly && user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />
  return <>{children}</>
}

function RequireGuest({ children, adminArea = false }: { children: React.ReactNode; adminArea?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (isAuthenticated) {
    return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard'} replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<RequireGuest><LandingPage /></RequireGuest>} />

            {/* Shop login — isolated from admin */}
            <Route path="/auth/login" element={<RequireGuest><LoginPage /></RequireGuest>} />

            {/* Admin login — isolated from shops */}
            <Route path="/admin/login" element={<RequireGuest><AdminLoginPage /></RequireGuest>} />

            {/* Client dashboard routes */}
            <Route path="/dashboard" element={<RequireAuth><DashboardLayout><DashboardPage /></DashboardLayout></RequireAuth>} />
            <Route path="/services" element={<RequireAuth><DashboardLayout><ServicesPage /></DashboardLayout></RequireAuth>} />
            <Route path="/customers" element={<RequireAuth><DashboardLayout><CustomersPage /></DashboardLayout></RequireAuth>} />
            <Route path="/appointments" element={<RequireAuth><DashboardLayout><AppointmentsPage /></DashboardLayout></RequireAuth>} />
            <Route path="/accounting" element={<RequireAuth><DashboardLayout><AccountingPage /></DashboardLayout></RequireAuth>} />
            <Route path="/pos" element={<RequireAuth><DashboardLayout><POSPage /></DashboardLayout></RequireAuth>} />
            <Route path="/sales" element={<RequireAuth><DashboardLayout><SalesPage /></DashboardLayout></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><DashboardLayout><SettingsPage /></DashboardLayout></RequireAuth>} />

            {/* Admin routes — require super admin */}
            <Route path="/admin" element={<RequireAuth adminOnly><AdminLayout><AdminAnalyticsPage /></AdminLayout></RequireAuth>} />
            <Route path="/admin/shops" element={<RequireAuth adminOnly><AdminLayout><AdminShopsPage /></AdminLayout></RequireAuth>} />
            <Route path="/admin/plans" element={<RequireAuth adminOnly><AdminLayout><AdminPlansPage /></AdminLayout></RequireAuth>} />
            <Route path="/admin/billing" element={<RequireAuth adminOnly><AdminLayout><AdminBillingPage /></AdminLayout></RequireAuth>} />

            {/* Fallbacks */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
