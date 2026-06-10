import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api'
import { formatCurrency, formatDate, statusColor, cn } from '@/lib/utils'
import { toast } from 'sonner'

export function AdminBillingPage() {
  const qc = useQueryClient()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: billing, isLoading } = useQuery({
    queryKey: ['admin-billing', page],
    queryFn: () => adminApi.billing.list({ page, limit: 20 }).then(r => r.data),
  })

  const { data: shops } = useQuery({
    queryKey: ['admin-shops-list'],
    queryFn: () => adminApi.shops.list({ limit: 200 }).then(r => r.data.data),
  })

  const triggerMutation = useMutation({
    mutationFn: () => adminApi.billing.trigger({ shop_id: selectedShopId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-billing'] }); toast.success('Billing triggered!'); setTriggerOpen(false) },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing Records</h1>
        <Button onClick={() => setTriggerOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Trigger Billing</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Shop</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {billing?.data?.map((b: any) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{b.business_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{b.plan_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatDate(b.billing_date)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(b.amount_due)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs', statusColor(b.status))}>{b.status}</span>
                    </td>
                  </tr>
                ))}
                {(!billing?.data?.length) && (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No billing records yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {billing && billing.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {billing.pages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page === billing.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Trigger Billing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Shop</Label>
              <Select onValueChange={setSelectedShopId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a shop..." /></SelectTrigger>
                <SelectContent>
                  {shops?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.business_name} — {s.subscription_status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">This will create a billing record for the selected shop based on their current subscription plan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerOpen(false)}>Cancel</Button>
            <Button disabled={!selectedShopId} loading={triggerMutation.isPending} onClick={() => triggerMutation.mutate()}>Trigger Billing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
