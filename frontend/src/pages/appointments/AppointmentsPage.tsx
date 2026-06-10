import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { Plus, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { appointmentsApi, customersApi, servicesApi } from '@/lib/api'
import { statusColor, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'

const schema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  staff_id: z.string().uuid().optional(),
  appointment_date: z.string(),
  start_time: z.string(),
  notes: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
})
type AppointmentForm = z.infer<typeof schema>

const STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

export function AppointmentsPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [viewDate, setViewDate] = useState(new Date())
  const [view, setView] = useState<'day' | 'week'>('day')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState<any>(null)

  const dateStr = format(viewDate, 'yyyy-MM-dd')

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments-calendar', dateStr],
    queryFn: () => appointmentsApi.calendar(dateStr).then(r => r.data),
  })

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersApi.list({ limit: 200 }).then(r => r.data.data),
  })

  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => servicesApi.list({ limit: 100 }).then(r => r.data.data),
  })

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<AppointmentForm>({
    resolver: zodResolver(schema),
    defaultValues: { appointment_date: dateStr, start_time: '09:00', status: 'PENDING' },
  })

  const createMutation = useMutation({
    mutationFn: (d: AppointmentForm) => appointmentsApi.create({ ...d, staff_id: d.staff_id || user?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments-calendar'] }); toast.success('Appointment created!'); setDialogOpen(false); reset() },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AppointmentForm }) => appointmentsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments-calendar'] }); toast.success('Updated!'); setDialogOpen(false) },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments-calendar'] }); toast.success('Appointment cancelled') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  })

  const openCreate = () => {
    setEditingAppt(null)
    reset({ appointment_date: dateStr, start_time: '09:00', status: 'PENDING' })
    setDialogOpen(true)
  }

  const openEdit = (appt: any) => {
    setEditingAppt(appt)
    reset({
      customer_id: appt.customer_id,
      service_id: appt.service_id,
      appointment_date: appt.appointment_date,
      start_time: appt.start_time?.slice(0, 5),
      status: appt.status,
      notes: appt.notes,
    })
    setDialogOpen(true)
  }

  const onSubmit = (form: AppointmentForm) => {
    if (editingAppt) updateMutation.mutate({ id: editingAppt.id, data: form })
    else createMutation.mutate(form)
  }

  const hours = Array.from({ length: 13 }, (_, i) => i + 7) // 7am - 7pm

  const getApptStyle = (appt: any) => {
    const [h, m] = appt.start_time.split(':').map(Number)
    const [eh, em] = appt.end_time.split(':').map(Number)
    const top = ((h - 7) * 60 + m) * (64 / 60)
    const height = Math.max(((eh - h) * 60 + (em - m)) * (64 / 60), 32)
    return { top: `${top}px`, height: `${height}px` }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-muted-foreground">{appointments?.length || 0} appointments on {format(viewDate, 'MMMM d, yyyy')}</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Appointment</Button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setViewDate(d => subDays(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{format(viewDate, 'EEEE, MMMM d yyyy')}</span>
        </div>
        <Button variant="outline" size="icon" onClick={() => setViewDate(d => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())}>Today</Button>
        <input type="date" value={dateStr} onChange={e => setViewDate(new Date(e.target.value + 'T00:00:00'))} className="rounded-md border px-3 py-1.5 text-sm bg-background" />
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
            <div className="relative" style={{ minHeight: `${13 * 64}px` }}>
              {/* Hour lines */}
              {hours.map(h => (
                <div key={h} className="absolute inset-x-0 flex" style={{ top: `${(h - 7) * 64}px` }}>
                  <div className="w-14 flex-shrink-0 pr-3 text-right text-xs text-muted-foreground pt-1">
                    {h.toString().padStart(2, '0')}:00
                  </div>
                  <div className="flex-1 border-t border-dashed" />
                </div>
              ))}

              {/* Appointments */}
              {isLoading ? (
                <div className="ml-14 space-y-2 p-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : appointments?.map((appt: any) => {
                try {
                  const style = getApptStyle(appt)
                  return (
                    <div
                      key={appt.id}
                      className={cn(
                        'absolute left-14 right-2 rounded-md px-2 py-1 text-xs cursor-pointer border hover:opacity-90 transition-opacity',
                        appt.status === 'CONFIRMED' ? 'bg-blue-100 border-blue-300 text-blue-900' :
                        appt.status === 'COMPLETED' ? 'bg-green-100 border-green-300 text-green-900' :
                        appt.status === 'CANCELLED' ? 'bg-gray-100 border-gray-300 text-gray-600 opacity-50' :
                        appt.status === 'NO_SHOW' ? 'bg-red-100 border-red-300 text-red-900 opacity-70' :
                        'bg-yellow-100 border-yellow-300 text-yellow-900'
                      )}
                      style={style}
                      onClick={() => openEdit(appt)}
                    >
                      <div className="font-medium truncate">{appt.customer_name || 'Walk-in'}</div>
                      <div className="truncate opacity-80">{appt.service_name || appt.package_name}</div>
                      <div className="opacity-70">{appt.start_time?.slice(0, 5)} – {appt.end_time?.slice(0, 5)}</div>
                    </div>
                  )
                } catch { return null }
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAppt ? 'Edit Appointment' : 'New Appointment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select onValueChange={(v) => setValue('customer_id', v === 'walkin' ? null : v)} defaultValue={editingAppt?.customer_id || 'walkin'}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in (no customer)</SelectItem>
                  {customers?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service</Label>
              <Select onValueChange={(v) => setValue('service_id', v === 'none' ? null : v)} defaultValue={editingAppt?.service_id || 'none'}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific service</SelectItem>
                  {services?.filter((s: any) => s.is_active).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {s.duration_minutes}min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input {...register('appointment_date')} type="date" className="mt-1" />
              </div>
              <div>
                <Label>Start Time</Label>
                <Input {...register('start_time')} type="time" className="mt-1" />
              </div>
            </div>
            {editingAppt && (
              <div>
                <Label>Status</Label>
                <Select onValueChange={(v) => setValue('status', v as any)} defaultValue={editingAppt?.status}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Any special instructions..." className="mt-1" rows={2} />
            </div>
            <DialogFooter className="gap-2">
              {editingAppt && (
                <Button type="button" variant="destructive" size="sm" loading={cancelMutation.isPending}
                  onClick={() => { cancelMutation.mutate(editingAppt.id); setDialogOpen(false) }}>
                  Cancel Appt
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Close</Button>
              <Button type="submit" loading={isSubmitting}>{editingAppt ? 'Save Changes' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
