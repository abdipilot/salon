import { useQuery } from '@tanstack/react-query'
import { Store, DollarSign, TrendingDown, BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/common/StatsCard'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626']

export function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => adminApi.analytics().then(r => r.data),
  })

  if (isLoading) return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    </div>
  )

  const kpis = data?.kpis || {}
  const churnRate = kpis.total_shops > 0
    ? ((kpis.cancelled_shops / kpis.total_shops) * 100).toFixed(1)
    : '0.0'
  const avgRevenue = kpis.active_shops > 0
    ? parseFloat(kpis.mtd_revenue || 0) / kpis.active_shops
    : 0

  const pieData = (data?.shops_by_category || []).map((r: any) => ({
    name: r.category, value: parseInt(r.count),
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Active Shops" value={kpis.active_shops || 0} subtitle={`${kpis.trial_shops || 0} on trial`} icon={Store} />
        <StatsCard title="MTD Revenue" value={formatCurrency(kpis.mtd_revenue || 0)} subtitle="This month" icon={DollarSign} iconColor="text-green-600" />
        <StatsCard title="Churn Rate" value={`${churnRate}%`} subtitle={`${kpis.cancelled_shops || 0} cancelled`} icon={TrendingDown} iconColor="text-red-500" />
        <StatsCard title="Avg Rev/Shop" value={formatCurrency(avgRevenue)} subtitle="This month" icon={BarChart2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Revenue — Last 12 Months</CardTitle></CardHeader>
          <CardContent>
            {data?.revenue_chart?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.revenue_chart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No revenue data yet</div>}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Shops by Category</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>}
          </CardContent>
        </Card>
      </div>

      {/* Shops by Status */}
      <Card>
        <CardHeader><CardTitle className="text-base">Shops by Status</CardTitle></CardHeader>
        <CardContent>
          {data?.shops_by_status?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.shops_by_status}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>}
        </CardContent>
      </Card>

      {/* Top Shops */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Shops by MTD Revenue</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Shop</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Appointments</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Customers</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">MTD Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data?.top_shops?.map((shop: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{shop.business_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{shop.plan_name || 'Trial'}</td>
                    <td className="px-4 py-3 text-right">{shop.appointments_count}</td>
                    <td className="px-4 py-3 text-right">{shop.customers_count}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(shop.mtd_revenue || 0)}</td>
                  </tr>
                ))}
                {(!data?.top_shops?.length) && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No revenue data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
