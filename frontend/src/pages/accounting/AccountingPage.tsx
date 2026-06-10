import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { TrendingDown, DollarSign, Wallet, Plus, Trash2, Edit2, BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatsCard } from '@/components/common/StatsCard'
import { accountingApi, expensesApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Supplies', 'Equipment', 'Salaries', 'Marketing', 'Maintenance', 'Other']
const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK_TRANSFER']
const PERIODS = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
]

export function AccountingPage() {
  const qc = useQueryClient()
  const [period, setPeriod] = useState('month')
  const [expenseDialog, setExpenseDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any>(null)

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => accountingApi.stats().then(r => r.data),
  })

  const { data: revenue = [] } = useQuery({
    queryKey: ['revenue-chart', period],
    queryFn: () => accountingApi.reports.revenue(period).then(r => r.data),
  })

  const { data: topServices = [] } = useQuery({
    queryKey: ['top-services'],
    queryFn: () => accountingApi.reports.services().then(r => r.data),
  })

  const { data: expSummary } = useQuery({
    queryKey: ['expenses-summary', period],
    queryFn: () => expensesApi.summary(period).then(r => r.data),
  })

  const { data: expensesData, isLoading: expLoading } = useQuery({
    queryKey: ['expenses-list', period],
    queryFn: () => expensesApi.list({ period, limit: 100 }).then(r => r.data),
  })

  const expenses = expensesData?.data || []
  const totalRevenue = expSummary?.revenue_total ?? stats?.monthly_revenue ?? 0
  const totalExpenses = expSummary?.expenses_total ?? 0
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0'

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: {
      category: 'General',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 10),
      payment_method: 'CASH',
      notes: '',
    },
  })

  const createExpense = useMutation({
    mutationFn: (d: any) => expensesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-list'] })
      qc.invalidateQueries({ queryKey: ['expenses-summary'] })
      toast.success('Expense added')
      setExpenseDialog(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to add expense'),
  })

  const updateExpense = useMutation({
    mutationFn: ({ id, data }: any) => expensesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-list'] })
      qc.invalidateQueries({ queryKey: ['expenses-summary'] })
      toast.success('Expense updated')
      setExpenseDialog(false)
      setEditingExpense(null)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update'),
  })

  const deleteExpense = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-list'] })
      qc.invalidateQueries({ queryKey: ['expenses-summary'] })
      toast.success('Expense deleted')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  })

  const openCreate = () => {
    setEditingExpense(null)
    reset({
      category: 'General',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 10),
      payment_method: 'CASH',
      notes: '',
    })
    setExpenseDialog(true)
  }

  const openEdit = (exp: any) => {
    setEditingExpense(exp)
    reset({
      category: exp.category,
      description: exp.description,
      amount: String(exp.amount),
      expense_date: exp.expense_date?.slice(0, 10),
      payment_method: exp.payment_method || 'CASH',
      notes: exp.notes || '',
    })
    setExpenseDialog(true)
  }

  const onExpenseSubmit = (data: any) => {
    if (editingExpense) updateExpense.mutate({ id: editingExpense.id, data })
    else createExpense.mutate(data)
  }

  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Revenue, expenses &amp; profit overview</p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <Button
              key={p.value}
              variant={period === p.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          subtitle={periodLabel}
          icon={DollarSign}
          iconColor="text-green-600"
        />
        <StatsCard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          subtitle={periodLabel}
          icon={TrendingDown}
          iconColor="text-red-500"
        />
        <StatsCard
          title="Net Profit"
          value={formatCurrency(netProfit)}
          subtitle={`${margin}% margin`}
          icon={Wallet}
          iconColor={netProfit >= 0 ? 'text-green-600' : 'text-red-500'}
        />
        <StatsCard
          title="Outstanding Debts"
          value={formatCurrency(stats?.outstanding_debts || 0)}
          subtitle="Unpaid balances"
          icon={BarChart2}
          iconColor="text-amber-500"
        />
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {revenue.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No revenue data yet. Complete appointments or use POS to record sales.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenue}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: any) => [formatCurrency(v), 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue by Service</CardTitle>
            </CardHeader>
            <CardContent>
              {topServices.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No service sales yet. Use POS or complete appointments to see data here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Service</th>
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium text-right">Times Sold</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(topServices as any[]).map((svc, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 font-medium">{svc.name}</td>
                          <td className="py-2.5 text-muted-foreground">{svc.category}</td>
                          <td className="py-2.5 text-right">{svc.invoice_count}</td>
                          <td className="py-2.5 text-right font-semibold text-green-700">
                            {formatCurrency(svc.total_revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Total:{' '}
                <span className="font-semibold text-foreground">{formatCurrency(totalExpenses)}</span>
                {' '}for {periodLabel.toLowerCase()}
              </p>
              {(expSummary?.by_category?.length ?? 0) > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {expSummary!.by_category.map((cat: any) => (
                    <Badge key={cat.category} variant="secondary" className="text-xs gap-1">
                      {cat.category} · {formatCurrency(cat.total)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {expLoading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-5 w-full" /></td></tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No expenses recorded for this period
                      </td>
                    </tr>
                  ) : (
                    (expenses as any[]).map(exp => (
                      <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-muted-foreground">{formatDate(exp.expense_date)}</td>
                        <td className="px-4 py-2.5 font-medium">{exp.description}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">{exp.category}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{exp.payment_method}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                          {formatCurrency(exp.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(exp)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteExpense.mutate(exp.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expense Dialog */}
      <Dialog
        open={expenseDialog}
        onOpenChange={v => { setExpenseDialog(v); if (!v) { setEditingExpense(null); reset() } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onExpenseSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select
                  defaultValue={editingExpense?.category || 'General'}
                  onValueChange={v => setValue('category', v)}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input {...register('expense_date', { required: true })} type="date" className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                {...register('description', { required: true })}
                placeholder="e.g. Monthly rent, supplies purchase..."
                className="mt-1"
              />
              {errors.description && <p className="text-destructive text-xs mt-1">Description is required</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (KES)</Label>
                <Input
                  {...register('amount', { required: true })}
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="mt-1"
                />
                {errors.amount && <p className="text-destructive text-xs mt-1">Amount is required</p>}
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select
                  defaultValue={editingExpense?.payment_method || 'CASH'}
                  onValueChange={v => setValue('payment_method', v)}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Input {...register('notes')} placeholder="Additional details..." className="mt-1" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseDialog(false)}>Cancel</Button>
              <Button type="submit" loading={createExpense.isPending || updateExpense.isPending}>
                {editingExpense ? 'Save Changes' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
