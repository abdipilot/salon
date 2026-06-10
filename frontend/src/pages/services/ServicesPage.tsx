import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Trash2, Package, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { servicesApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const serviceSchema = z.object({
  name: z.string().min(1, 'Name required'),
  description: z.string().optional(),
  category: z.enum(['Hair', 'Makeup', 'Nails', 'Skin', 'Massage', 'Beard', 'Other']),
  base_price: z.coerce.number().min(0, 'Price must be positive'),
  duration_minutes: z.coerce.number().int().min(5, 'Min 5 min').max(480, 'Max 8 hours'),
  image_url: z.string().url().optional().or(z.literal('')),
})
type ServiceForm = z.infer<typeof serviceSchema>

const CATEGORIES = ['Hair', 'Makeup', 'Nails', 'Skin', 'Massage', 'Beard', 'Other']

export function ServicesPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<any>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list({ limit: 100 }).then(r => r.data),
  })

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { category: 'Other', duration_minutes: 60 },
  })

  const createMutation = useMutation({
    mutationFn: (d: ServiceForm) => servicesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Service created!'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ServiceForm }) => servicesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Service updated!'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => servicesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Service deactivated'); setDeleteId(null) },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  })

  const openCreate = () => { setEditingService(null); reset({ category: 'Other', duration_minutes: 60 }); setDialogOpen(true) }
  const openEdit = (svc: any) => {
    setEditingService(svc)
    reset({ name: svc.name, description: svc.description, category: svc.category, base_price: svc.base_price, duration_minutes: svc.duration_minutes, image_url: svc.image_url || '' })
    setDialogOpen(true)
  }
  const closeDialog = () => { setDialogOpen(false); setEditingService(null) }

  const onSubmit = (form: ServiceForm) => {
    if (editingService) updateMutation.mutate({ id: editingService.id, data: form })
    else createMutation.mutate(form)
  }

  const services = data?.data || []
  const filtered = services.filter((s: any) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || s.category === categoryFilter
    return matchSearch && matchCat && s.is_active
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="text-muted-foreground">{services.filter((s: any) => s.is_active).length} active services</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Add Service</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search services..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services yet"
          description="Add services to show them on your booking page and use them in invoices."
          action={{ label: 'Add Service', onClick: openCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((svc: any) => (
            <Card key={svc.id} className="overflow-hidden hover:shadow-md transition-shadow">
              {svc.image_url && (
                <div className="h-40 overflow-hidden">
                  <img src={svc.image_url} alt={svc.name} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{svc.name}</h3>
                    {svc.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{svc.description}</p>}
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">{svc.category}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="font-bold text-primary">{formatCurrency(svc.base_price)}</p>
                    <p className="text-xs text-muted-foreground">{svc.duration_minutes} min</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(svc)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(svc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Service Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input {...register('name')} placeholder="e.g. Hair Cut" className="mt-1" />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label>Category</Label>
              <Select onValueChange={(v) => setValue('category', v as any)} defaultValue={editingService?.category || 'Other'}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (KES)</Label>
                <Input {...register('base_price')} type="number" step="0.01" placeholder="0.00" className="mt-1" />
                {errors.base_price && <p className="text-destructive text-xs mt-1">{errors.base_price.message}</p>}
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input {...register('duration_minutes')} type="number" placeholder="60" className="mt-1" />
                {errors.duration_minutes && <p className="text-destructive text-xs mt-1">{errors.duration_minutes.message}</p>}
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea {...register('description')} placeholder="Brief description..." className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Image URL (optional)</Label>
              <Input {...register('image_url')} placeholder="https://..." className="mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{editingService ? 'Save Changes' : 'Create Service'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate Service?</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">This service will be hidden but historical data is preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
