import { useQuery } from '@tanstack/react-query'
import { DollarSign, Users, AlertCircle, Calendar, TrendingUp, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatsCard } from '@/components/common/StatsCard'
import { accountingApi, appointmentsApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDate, statusColor, daysUntil } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

export function DashboardPage() {
  const { user } = useAuthStore()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => accountingApi.stats().then(r => r.data),
  })

  const { data: revenue } = useQuery({
    queryKey: ['revenue-chart', 'week'],
    queryFn: () => accountingApi.reports.revenue('week').then(r => r.data),
  })

  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: todayAppointments } = useQuery({
    queryKey: ['appointments-today', today],
    queryFn: () => appointmentsApi.calendar(today).then(r => r.data),
  })

  const { data: recentInvoices } = useQuery({
    queryKey: ['invoices-recent'],
    queryFn: () => accountingApi.invoices.list({ limit: 5 }).then(r => r.data),
  })

  const trialDays = user?.trial_ends_at ? daysUntil(user.trial_ends_at) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.first_name}!</p>
      </div>

      {/* Trial Banner */}
      {user?.subscription_status === 'TRIAL' && trialDays !== null && trialDays >= 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Trial expires in {trialDays} day{trialDays !== 1 ? 's' : ''}</p>
              <p className="text-sm text-amber-700">Upgrade to keep all your data and unlock more features</p>
            </div>
          </div>
          <Link to="/settings">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">Upgrade Now</Button>
          </Link>
        </div>
      )}

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Monthly Revenue"
            value={formatCurrency(stats?.monthly_revenue || 0)}
            icon={DollarSign}
            iconColor="text-green-600"
            subtitle="This month"
          />
          <StatsCard
            title="Pending Invoices"
            value={stats?.pending_invoices?.count || 0}
            subtitle={formatCurrency(stats?.pending_invoices?.amount || 0)}
            icon={AlertCircle}
            iconColor="text-orange-500"
          />
          <StatsCard
            title="Outstanding Debts"
            value={formatCurrency(stats?.outstanding_debts || 0)}
            icon={TrendingUp}
            iconColor="text-red-500"
          />
          <StatsCard
            title="Appointments Today"
            value={stats?.appointments_today || 0}
            icon={Calendar}
            iconColor="text-blue-500"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={l => `Date: ${l}`} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No revenue data yet. Record payments to see charts.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {todayAppointments?.length > 0 ? (
              <div className="space-y-3">
                {todayAppointments.slice(0, 5).map((appt: any) => (
                  <div key={appt.id} className="flex items-start gap-3">
                    <div className="text-xs text-muted-foreground w-12 flex-shrink-0 pt-0.5">{appt.start_time?.slice(0, 5)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{appt.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-muted-foreground truncate">{appt.service_name || appt.package_name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(appt.status)}`}>{appt.status}</span>
                  </div>
                ))}
                {todayAppointments.length > 5 && (
                  <Link to="/appointments" className="text-xs text-primary hover:underline block text-center">
                    +{todayAppointments.length - 5} more
                  </Link>
                )}
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <Calendar className="h-8 w-8 mb-2 opacity-30" />
                No appointments today
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Invoices</CardTitle>
          <Link to="/accounting"><Button variant="ghost" size="sm">View all</Button></Link>
        </CardHeader>
        <CardContent>
          {recentInvoices?.data?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left pb-2 font-medium text-muted-foreground">Customer</th>
                    <th className="text-right pb-2 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right pb-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.data.map((inv: any) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-2">{inv.invoice_number}</td>
                      <td className="py-2 text-muted-foreground">{inv.customer_name || 'Walk-in'}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(inv.payment_status)}`}>{inv.payment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No invoices yet. <Link to="/accounting" className="text-primary hover:underline">Create your first invoice</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
