import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Edit2, Trash2, CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { adminApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const FEATURES = [
  { key: 'sms_reminders', label: 'SMS Reminders' },
  { key: 'advanced_analytics', label: 'Advanced Analytics' },
  { key: 'inventory', label: 'Inventory Management' },
  { key: 'staff_management', label: 'Staff Management' },
  { key: 'api_access', label: 'API Access' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'white_label', label: 'White Label' },
]

export function AdminPlansPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any>(null)
  const [features, setFeatures] = useState<Record<string, boolean>>({})

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => adminApi.plans.list().then(r => r.data),
  })

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm()

  const createMutation = useMutation({
    mutationFn: (d: any) => adminApi.plans.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast.success('Plan created!'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.plans.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast.success('Plan updated!'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.plans.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast.success('Plan deactivated') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.plans.update(id, { is_active: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast.success('Plan reactivated') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const openCreate = () => {
    setEditingPlan(null)
    reset({ max_staff: 5, max_customers: 100, max_appointments_per_month: 200 })
    setFeatures({})
    setDialogOpen(true)
  }

  const openEdit = (plan: any) => {
    setEditingPlan(plan)
    reset({ name: plan.name, description: plan.description, price_per_month: plan.price_per_month, max_staff: plan.max_staff, max_customers: plan.max_customers, max_appointments_per_month: plan.max_appointments_per_month })
    setFeatures(plan.features || {})
    setDialogOpen(true)
  }

  const closeDialog = () => { setDialogOpen(false); setEditingPlan(null) }

  const onSubmit = (form: any) => {
    const data = { ...form, features }
    if (editingPlan) updateMutation.mutate({ id: editingPlan.id, data })
    else createMutation.mutate(data)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subscription Plans</h1>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Plan</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans?.map((plan: any) => (
          <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {!plan.is_active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <div className="text-2xl font-bold">{formatCurrency(plan.price_per_month)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{plan.description}</p>
              <div className="text-xs space-y-1">
                <p>👥 Up to {plan.max_staff === 9999 ? '∞' : plan.max_staff} staff</p>
                <p>🧑 {plan.max_customers === 99999 ? '∞' : plan.max_customers} customers</p>
                <p>📅 {plan.max_appointments_per_month === 99999 ? '∞' : plan.max_appointments_per_month} appts/mo</p>
              </div>
              {plan.features && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {FEATURES.filter(f => plan.features[f.key]).map(f => (
                    <span key={f.key} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{f.label}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{plan.shops_count} shops on this plan</p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(plan)}><Edit2 className="h-3 w-3" /> Edit</Button>
                {plan.is_active ? (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Deactivate" onClick={() => deactivateMutation.mutate(plan.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" title="Reactivate" onClick={() => reactivateMutation.mutate(plan.id)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPlan ? 'Edit Plan' : 'Create Plan'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input {...register('name', { required: true })} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea {...register('description')} className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Price per Month (KES)</Label>
              <Input {...register('price_per_month', { required: true })} type="number" step="0.01" className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Max Staff</Label>
                <Input {...register('max_staff')} type="number" className="mt-1" />
              </div>
              <div>
                <Label>Max Customers</Label>
                <Input {...register('max_customers')} type="number" className="mt-1" />
              </div>
              <div>
                <Label>Max Appts/mo</Label>
                <Input {...register('max_appointments_per_month')} type="number" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Features</Label>
              <div className="space-y-2">
                {FEATURES.map(f => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!features[f.key]} onChange={e => setFeatures({ ...features, [f.key]: e.target.checked })} />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{editingPlan ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
