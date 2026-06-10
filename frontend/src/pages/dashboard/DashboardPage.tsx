import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, Users, AlertCircle, Calendar, TrendingUp, Clock,
  UserPlus, UserCheck, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatsCard } from '@/components/common/StatsCard'
import { accountingApi, appointmentsApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDate, statusColor, daysUntil } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">No data</span>
  if (previous === 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><ArrowUp className="h-3 w-3" /> New</span>
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> Same as last month</span>
  return pct > 0
    ? <span className="text-xs text-green-600 flex items-center gap-0.5"><ArrowUp className="h-3 w-3" /> {pct}% vs last month</span>
    : <span className="text-xs text-red-500 flex items-center gap-0.5"><ArrowDown className="h-3 w-3" /> {Math.abs(pct)}% vs last month</span>
}

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

  const { data: customerAnalytics, isLoading: caLoading } = useQuery({
    queryKey: ['customer-analytics'],
    queryFn: () => accountingApi.reports.customerAnalytics().then(r => r.data),
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

  const ca = customerAnalytics
  const totalBuyers = (ca?.new_buyers_this_month || 0) + (ca?.returning_buyers_this_month || 0)

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
            title="Total Customers"
            value={ca?.total_customers ?? stats?.total_customers ?? '—'}
            icon={Users}
            iconColor="text-purple-500"
            subtitle={ca ? `${ca.new_this_month} new this month` : 'Loading…'}
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

      {/* Revenue chart + Today's appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
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

      {/* ── CUSTOMER ANALYTICS ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Customer Analytics</h2>

        {caLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total customers */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Total Customers</p>
                  <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{ca?.total_customers ?? 0}</p>
                <Trend current={ca?.new_this_month ?? 0} previous={ca?.new_last_month ?? 0} />
              </CardContent>
            </Card>

            {/* New this month */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">New This Month</p>
                  <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-green-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{ca?.new_this_month ?? 0}</p>
                <Trend current={ca?.new_this_month ?? 0} previous={ca?.new_last_month ?? 0} />
              </CardContent>
            </Card>

            {/* New buyers this month */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">First-time Buyers</p>
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{ca?.new_buyers_this_month ?? 0}</p>
                <p className="text-xs text-muted-foreground">Paid for the first time this month</p>
              </CardContent>
            </Card>

            {/* Returning buyers */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Returning Buyers</p>
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-amber-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{ca?.returning_buyers_this_month ?? 0}</p>
                {totalBuyers > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round((ca.returning_buyers_this_month / totalBuyers) * 100)}% retention this month
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer growth chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">New Customers — Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              {caLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : ca?.growth?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ca.growth} barSize={10}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number) => [v, 'New customers']}
                      labelFormatter={l => `Date: ${l}`}
                    />
                    <Bar dataKey="new_customers" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No customer growth data for the last 30 days.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top customers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Top Customers</CardTitle>
              <Link to="/customers">
                <Button variant="ghost" size="sm" className="text-xs h-7">View all</Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {caLoading ? (
                <div className="space-y-3 px-6 pb-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : ca?.top_customers?.length > 0 ? (
                <div className="divide-y">
                  {ca.top_customers.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-6 py-2.5">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.visit_count} visit{c.visit_count !== 1 ? 's' : ''}
                          {c.last_visit ? ` · last ${formatDate(c.last_visit)}` : ''}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-green-700 flex-shrink-0">
                        {formatCurrency(c.total_spent)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
                  No customer spending data yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Sales</CardTitle>
          <Link to="/sales"><Button variant="ghost" size="sm">View all</Button></Link>
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
                      <td className="py-2 font-mono text-xs">{inv.invoice_number}</td>
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
              No sales yet. <Link to="/pos" className="text-primary hover:underline">Start a checkout</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
