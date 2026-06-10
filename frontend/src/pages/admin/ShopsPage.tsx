import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Eye, ShieldOff, Shield, Edit2, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi, publicApi } from '@/lib/api'
import { formatCurrency, formatDate, statusColor, cn } from '@/lib/utils'
import { toast } from 'sonner'

const STATUS_OPTIONS = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']
const CATEGORY_OPTIONS = ['SALON', 'BARBER', 'MAKEUP', 'COMBO']

export function AdminShopsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [viewingShop, setViewingShop] = useState<any>(null)
  const [editingShop, setEditingShop] = useState<any>(null)
  const [deletingShop, setDeletingShop] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})

  const { data, isLoading } = useQuery({
    queryKey: ['admin-shops', page, search, statusFilter],
    queryFn: () => adminApi.shops.list({
      page, limit: 20,
      search: search || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }).then(r => r.data),
  })

  const { data: shopDetail } = useQuery({
    queryKey: ['admin-shop-detail', viewingShop?.id],
    queryFn: () => viewingShop ? adminApi.shops.get(viewingShop.id).then(r => r.data) : null,
    enabled: !!viewingShop,
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => publicApi.plans().then(r => r.data),
  })

  const suspendMutation = useMutation({
    mutationFn: (id: string) => adminApi.shops.suspend(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-shops'] }); toast.success('Shop suspended') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => adminApi.shops.unsuspend(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-shops'] }); toast.success('Shop reactivated') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.shops.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-shops'] })
      qc.invalidateQueries({ queryKey: ['admin-shop-detail'] })
      toast.success('Shop updated')
      setEditingShop(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.shops.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-shops'] })
      toast.success('Shop deleted')
      setDeletingShop(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  })

  const openEdit = (shop: any) => {
    setEditForm({
      business_name: shop.business_name,
      category: shop.category,
      subscription_plan_id: shop.subscription_plan_id || '',
      subscription_status: shop.subscription_status,
      phone: shop.phone || '',
      city: shop.city || '',
      country: shop.country || '',
    })
    setEditingShop(shop)
  }

  const shops = data?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shops</h1>
        <p className="text-muted-foreground">{data?.total || 0} total shops</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search shops..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Business</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Owner</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Plan</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">MTD Revenue</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Trial Days</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop: any) => (
                  <tr key={shop.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{shop.business_name}</p>
                      <p className="text-xs text-muted-foreground">{shop.category}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      <p>{shop.owner_name}</p>
                      <p className="text-xs">{shop.owner_email}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{shop.plan_name || 'Trial'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs', statusColor(shop.subscription_status))}>{shop.subscription_status}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium hidden md:table-cell">{formatCurrency(shop.mtd_revenue || 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                      {shop.subscription_status === 'TRIAL' ? `${Math.max(0, Math.ceil(shop.trial_days_remaining || 0))} days` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="View details" onClick={() => setViewingShop(shop)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit shop" onClick={() => openEdit(shop)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {shop.subscription_status === 'SUSPENDED' ? (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" title="Reactivate" loading={unsuspendMutation.isPending} onClick={() => unsuspendMutation.mutate(shop.id)}>
                            <Shield className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" title="Suspend" loading={suspendMutation.isPending} onClick={() => suspendMutation.mutate(shop.id)}>
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete shop" onClick={() => setDeletingShop(shop)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!shops.length && <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No shops found</td></tr>}
              </tbody>
            </table>
          </div>
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {data.pages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page === data.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* View Detail Dialog */}
      <Dialog open={!!viewingShop} onOpenChange={() => setViewingShop(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{shopDetail?.business_name}</DialogTitle></DialogHeader>
          {shopDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Owner:</span> <span className="font-medium">{shopDetail.owner_name}</span></div>
                <div><span className="text-muted-foreground">Email:</span> {shopDetail.owner_email}</div>
                <div><span className="text-muted-foreground">Phone:</span> {shopDetail.phone || shopDetail.owner_phone || '—'}</div>
                <div><span className="text-muted-foreground">Category:</span> {shopDetail.category}</div>
                <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{shopDetail.plan_name || 'No plan'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className={cn('px-2 py-0.5 rounded text-xs', statusColor(shopDetail.subscription_status))}>{shopDetail.subscription_status}</span></div>
                <div><span className="text-muted-foreground">Trial ends:</span> {shopDetail.trial_ends_at ? formatDate(shopDetail.trial_ends_at) : '—'}</div>
                <div><span className="text-muted-foreground">Created:</span> {formatDate(shopDetail.created_at)}</div>
                <div><span className="text-muted-foreground">Services:</span> {shopDetail.services_count}</div>
                <div><span className="text-muted-foreground">Customers:</span> {shopDetail.customers_count}</div>
                <div><span className="text-muted-foreground">Appointments:</span> {shopDetail.appointments_count}</div>
                <div><span className="text-muted-foreground">Total Revenue:</span> <span className="font-bold text-green-600">{formatCurrency(shopDetail.total_revenue || 0)}</span></div>
              </div>
              {shopDetail.address && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Address:</span>{' '}
                  {[shopDetail.address, shopDetail.city, shopDetail.country].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { openEdit(viewingShop); setViewingShop(null) }} className="gap-2">
              <Edit2 className="h-4 w-4" /> Edit
            </Button>
            {shopDetail?.subscription_status === 'SUSPENDED' ? (
              <Button onClick={() => { unsuspendMutation.mutate(shopDetail.id); setViewingShop(null) }} className="gap-2">
                <Shield className="h-4 w-4" /> Reactivate
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => { suspendMutation.mutate(shopDetail?.id); setViewingShop(null) }} className="gap-2">
                <ShieldOff className="h-4 w-4" /> Suspend
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingShop} onOpenChange={() => setEditingShop(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Shop — {editingShop?.business_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Business Name</Label>
                <Input value={editForm.business_name || ''} onChange={e => setEditForm({ ...editForm, business_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editForm.category} onValueChange={v => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>City</Label>
                <Input value={editForm.city || ''} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Subscription Plan</Label>
              <Select value={editForm.subscription_plan_id || 'none'} onValueChange={v => setEditForm({ ...editForm, subscription_plan_id: v === 'none' ? null : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No plan (trial)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan (trial)</SelectItem>
                  {plans.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price_per_month)}/mo</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subscription Status</Label>
              <Select value={editForm.subscription_status} onValueChange={v => setEditForm({ ...editForm, subscription_status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShop(null)}>Cancel</Button>
            <Button
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: editingShop.id, data: editForm })}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deletingShop} onOpenChange={() => setDeletingShop(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Shop?</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to permanently delete <strong>{deletingShop?.business_name}</strong>?
            This will delete all their data including customers, appointments, and invoices. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingShop(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deletingShop.id)}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
