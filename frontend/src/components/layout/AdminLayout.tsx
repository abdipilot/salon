import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Store, CreditCard, Package, BarChart3, LogOut, Menu, Sparkles, ChevronDown, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/lib/api'
import { cn, getInitials } from '@/lib/utils'

const navItems = [
  { href: '/admin', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/shops', icon: Store, label: 'Shops' },
  { href: '/admin/billing', icon: CreditCard, label: 'Billing' },
  { href: '/admin/plans', icon: Package, label: 'Plans' },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, refreshToken, logout } = useAuthStore()

  const handleLogout = async () => {
    try { if (refreshToken) await authApi.logout(refreshToken) } catch {}
    logout()
    navigate('/admin/login')
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-6 border-b border-white/10 gap-2">
        <Sparkles className="h-6 w-6 text-white" />
        <span className="text-xl font-bold text-white">SalonHub</span>
        <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs text-white">Admin</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            to={href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              (href === '/admin' ? pathname === href : pathname.startsWith(href))
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
        <div className="flex items-center gap-2 px-3 py-2">
          <Shield className="h-4 w-4 text-white/60" />
          <span className="text-xs text-white/60">Super Admin</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-sidebar flex-shrink-0">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {user ? getInitials(`${user.first_name} ${user.last_name}`) : 'A'}
                  </div>
                  <span className="hidden md:inline">{user?.first_name}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
