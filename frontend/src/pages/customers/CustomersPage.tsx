import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Edit2, Trash2, Eye, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { customersApi } from '@/lib/api'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

const schema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['M', 'F', 'OTHER']).optional(),
  date_of_birth: z.string().optional(),
  notes: z.string().optional(),
})
type CustomerForm = z.infer<typeof schema>

export function CustomersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<any>(null)
  const [viewingCustomer, setViewingCustomer] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => customersApi.list({ page, limit: 20, search: search || undefined }).then(r => r.data),
  })

  const { data: customerDetail } = useQuery({
    queryKey: ['customer-detail', viewingCustomer?.id],
    queryFn: () => viewingCustomer ? customersApi.get(viewingCustomer.id).then(r => r.data) : null,
    enabled: !!viewingCustomer,
  })

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<CustomerForm>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (d: CustomerForm) => customersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer added!'); setDialogOpen(false); reset() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomerForm }) => customersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer updated!'); setDialogOpen(false) },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer deleted') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const openCreate = () => { setEditingCustomer(null); reset({}); setDialogOpen(true) }
  const openEdit = (c: any) => {
    setEditingCustomer(c)
    reset({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, gender: c.gender, notes: c.notes })
    setDialogOpen(true)
  }

  const onSubmit = (form: CustomerForm) => {
    if (editingCustomer) updateMutation.mutate({ id: editingCustomer.id, data: form })
    else createMutation.mutate(form)
  }

  const customers = data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">{data?.total || 0} total customers</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Add Customer</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="Start adding customers to track their appointments and spending." action={{ label: 'Add Customer', onClick: openCreate }} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Total Spent</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Appointments</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => { setViewingCustomer(c); setViewOpen(true) }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                          {getInitials(`${c.first_name} ${c.last_name}`)}
                        </div>
                        <div>
                          <p className="font-medium">{c.first_name} {c.last_name}</p>
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium hidden sm:table-cell">{formatCurrency(c.total_spent || 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">{c.appointment_count}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input {...register('first_name')} className="mt-1" />
                {errors.first_name && <p className="text-destructive text-xs mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <Label>Last Name</Label>
                <Input {...register('last_name')} className="mt-1" />
                {errors.last_name && <p className="text-destructive text-xs mt-1">{errors.last_name.message}</p>}
              </div>
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...register('phone')} placeholder="+254..." className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input {...register('email')} type="email" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gender</Label>
                <Select onValueChange={(v) => setValue('gender', v as any)} defaultValue={editingCustomer?.gender}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input {...register('date_of_birth')} type="date" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Any special notes..." className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{editingCustomer ? 'Save Changes' : 'Add Customer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Customer Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingCustomer?.first_name} {viewingCustomer?.last_name}</DialogTitle>
          </DialogHeader>
          {customerDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Phone:</span> {customerDetail.phone || '—'}</div>
                <div><span className="text-muted-foreground">Email:</span> {customerDetail.email || '—'}</div>
                <div><span className="text-muted-foreground">Total Spent:</span> <span className="font-semibold text-primary">{formatCurrency(customerDetail.total_spent || 0)}</span></div>
                <div><span className="text-muted-foreground">Loyalty Points:</span> {customerDetail.loyalty_points}</div>
              </div>
              {customerDetail.notes && <p className="text-sm bg-muted rounded p-3">{customerDetail.notes}</p>}

              {customerDetail.debts?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-destructive">Outstanding Debts</h4>
                  {customerDetail.debts.map((d: any) => (
                    <div key={d.id} className="flex justify-between text-sm py-1 border-b">
                      <span>{formatDate(d.created_at)}</span>
                      <span className="font-medium text-destructive">{formatCurrency(d.remaining_amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {customerDetail.appointments?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Recent Appointments</h4>
                  {customerDetail.appointments.slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex justify-between text-sm py-1 border-b">
                      <span>{formatDate(a.appointment_date)} — {a.service_name}</span>
                      <Badge variant="outline" className="text-xs">{a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
