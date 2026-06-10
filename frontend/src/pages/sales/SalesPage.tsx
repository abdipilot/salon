import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { accountingApi } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
]

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge className="bg-green-100 text-green-700 border-green-200">Paid</Badge>
  if (status === 'PARTIAL') return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Partial</Badge>
  if (status === 'PENDING') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Pending</Badge>
  if (status === 'OVERDUE') return <Badge className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>
  return <Badge variant="outline">{status}</Badge>
}

export function SalesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const limit = 50

  // Collect payment dialog state
  const [collectInvoice, setCollectInvoice] = useState<any>(null)
  const [collectAmount, setCollectAmount] = useState(0)
  const [collectMethod, setCollectMethod] = useState('CASH')
  const [collectRef, setCollectRef] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sales', page, statusFilter],
    queryFn: () => accountingApi.invoices.list({
      page,
      limit,
      ...(statusFilter !== 'ALL' && { status: statusFilter }),
    }).then(r => r.data),
  })

  const invoices: any[] = data?.data || []
  const total = data?.total || 0

  const filtered = invoices.filter(inv => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer_name?.toLowerCase().includes(q) ||
      inv.items_summary?.toLowerCase().includes(q)
    )
  })

  const collectMutation = useMutation({
    mutationFn: () => accountingApi.payments.create({
      invoice_id: collectInvoice.id,
      payment_method: collectMethod,
      amount_paid: collectAmount,
      payment_reference: collectRef || null,
      notes: null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Payment recorded!')
      setCollectInvoice(null)
      setCollectRef('')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record payment'),
  })

  const openCollect = (inv: any) => {
    const outstanding = parseFloat(inv.total_amount) - parseFloat(inv.amount_paid)
    setCollectInvoice(inv)
    setCollectAmount(outstanding)
    setCollectMethod('CASH')
    setCollectRef('')
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm mt-0.5">All transactions — cash, partial payments, and debts</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice, customer, items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Date &amp; Time</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    {search || statusFilter !== 'ALL'
                      ? 'No sales match your filters.'
                      : 'No sales yet. Complete a checkout to see records here.'}
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const outstanding = parseFloat(inv.total_amount) - parseFloat(inv.amount_paid)
                  return (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {formatDateTime(inv.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {inv.customer_name ? (
                          <div>
                            <p className="font-medium">{inv.customer_name}</p>
                            {inv.customer_phone && (
                              <p className="text-xs text-muted-foreground">{inv.customer_phone}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Walk-in</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate text-xs" title={inv.items_summary}>
                        {inv.items_summary || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-700 font-medium">
                        {formatCurrency(inv.amount_paid)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {outstanding > 0 ? (
                          <span className="text-amber-700 font-medium">{formatCurrency(outstanding)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.payment_status} />
                      </td>
                      <td className="px-4 py-3">
                        {inv.payment_status !== 'PAID' && outstanding > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs whitespace-nowrap"
                            onClick={() => openCollect(inv)}
                          >
                            Collect {formatCurrency(outstanding)}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>Showing {filtered.length} of {total} sales</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="flex items-center px-2">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Collect Payment Dialog */}
      <Dialog open={!!collectInvoice} onOpenChange={v => { if (!v) setCollectInvoice(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
          </DialogHeader>
          {collectInvoice && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice</span>
                  <span className="font-mono font-semibold text-primary">{collectInvoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{collectInvoice.customer_name || 'Walk-in'}</span>
                </div>
                {collectInvoice.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{collectInvoice.customer_phone}</span>
                  </div>
                )}
                {collectInvoice.items_summary && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground flex-shrink-0">Items</span>
                    <span className="text-right text-xs">{collectInvoice.items_summary}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-muted-foreground">Invoice total</span>
                  <span className="font-medium">{formatCurrency(collectInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already paid</span>
                  <span className="text-green-700 font-medium">{formatCurrency(collectInvoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Outstanding</span>
                  <span className="text-amber-700">
                    {formatCurrency(parseFloat(collectInvoice.total_amount) - parseFloat(collectInvoice.amount_paid))}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Payment Method</Label>
                  <Select value={collectMethod} onValueChange={setCollectMethod}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Amount (KES)</Label>
                  <Input
                    type="number" min="1"
                    value={collectAmount || ''}
                    onChange={e => setCollectAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                {(collectMethod === 'MPESA' || collectMethod === 'CARD' || collectMethod === 'BANK_TRANSFER') && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Reference (optional)</Label>
                    <Input
                      value={collectRef}
                      onChange={e => setCollectRef(e.target.value)}
                      placeholder={collectMethod === 'MPESA' ? 'M-Pesa code' : 'Reference #'}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCollectInvoice(null)}>Cancel</Button>
                <Button
                  disabled={collectAmount <= 0}
                  loading={collectMutation.isPending}
                  onClick={() => collectMutation.mutate()}
                >
                  Record Payment
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
