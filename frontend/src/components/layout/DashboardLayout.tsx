import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Scissors, Users, Calendar, Receipt, Settings,
  LogOut, Menu, X, ChevronDown, Sparkles, ShoppingCart, ClipboardList
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/lib/api'
import { cn, daysUntil, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/pos', icon: ShoppingCart, label: 'POS / Checkout' },
  { href: '/sales', icon: ClipboardList, label: 'Sales' },
  { href: '/services', icon: Scissors, label: 'Services' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/appointments', icon: Calendar, label: 'Appointments' },
  { href: '/accounting', icon: Receipt, label: 'Reports' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, refreshToken, logout } = useAuthStore()

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {}
    logout()
    navigate('/auth/login')
  }

  const trialDays = user?.trial_ends_at ? daysUntil(user.trial_ends_at) : null
  const isTrial = user?.subscription_status === 'TRIAL'
  const showTrialBanner = isTrial && trialDays !== null

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6 border-b border-white/10">
        <Sparkles className="h-6 w-6 text-white mr-2" />
        <span className="text-xl font-bold text-white">SalonHub</span>
      </div>

      {showTrialBanner && (
        <div className={cn(
          'mx-3 mt-3 rounded-lg border p-3 text-xs',
          trialDays !== null && trialDays <= 0
            ? 'bg-red-500/20 border-red-500/30 text-red-200'
            : trialDays !== null && trialDays <= 3
            ? 'bg-orange-500/20 border-orange-500/30 text-orange-200'
            : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-200'
        )}>
          <div className="font-semibold">
            {trialDays !== null && trialDays <= 0
              ? 'Trial expired!'
              : `Trial: ${trialDays} day${trialDays !== 1 ? 's' : ''} left`}
          </div>
          <Link to="/settings" className="underline mt-1 block hover:text-white">Upgrade now →</Link>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            to={href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold">
            {user ? getInitials(`${user.first_name} ${user.last_name}`) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-white/60 truncate">{user?.business_name}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-sidebar flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 lg:hidden" />
          <div className="flex items-center gap-2 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {user ? getInitials(`${user.first_name} ${user.last_name}`) : 'U'}
                  </div>
                  <span className="hidden md:inline">{user?.first_name}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
