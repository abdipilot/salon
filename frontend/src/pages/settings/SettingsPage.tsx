import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { settingsApi, publicApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDate, daysUntil, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle2, ArrowUp, ArrowDown, Clock, Crown, Zap, BarChart3 } from 'lucide-react'

function SubscriptionTab() {
  const qc = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [changingPlan, setChangingPlan] = useState<string | null>(null)

  const { data: plans = [] } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => publicApi.plans().then(r => r.data),
  })

  const { data: shop } = useQuery({
    queryKey: ['settings-shop'],
    queryFn: () => settingsApi.getShop().then(r => r.data),
  })

  const trialDays = user?.trial_ends_at ? daysUntil(user.trial_ends_at) : null
  const isTrial = user?.subscription_status === 'TRIAL'
  const currentPlanId = user?.subscription_plan_id || shop?.subscription_plan_id
  const planPrice = user?.plan_price
  const planName = user?.plan_name

  const upgradeMutation = useMutation({
    mutationFn: (planId: string) => settingsApi.upgradePlan(planId),
    onSuccess: (res, planId) => {
      const plan = plans.find((p: any) => p.id === planId)
      if (user) setUser({ ...user, subscription_status: 'ACTIVE', subscription_plan_id: planId, plan_name: plan?.name })
      qc.invalidateQueries({ queryKey: ['settings-shop'] })
      toast.success(`Switched to ${plan?.name} plan!`)
      setChangingPlan(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to change plan'),
  })

  const statusColor = (s: string) => {
    if (s === 'ACTIVE') return 'bg-green-100 text-green-700'
    if (s === 'TRIAL') return 'bg-amber-100 text-amber-700'
    if (s === 'SUSPENDED') return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-700'
  }

  const getPlanFeatures = (plan: any): string[] => {
    const lines = [
      `Up to ${plan.max_staff >= 9999 ? 'unlimited' : plan.max_staff} staff`,
      `${plan.max_customers >= 99999 ? 'Unlimited' : plan.max_customers.toLocaleString()} customers`,
      `${plan.max_appointments_per_month >= 99999 ? 'Unlimited' : plan.max_appointments_per_month} appointments/mo`,
    ]
    if (plan.features?.staff_management) lines.push('Staff management')
    if (plan.features?.inventory) lines.push('Inventory tracking')
    if (plan.features?.advanced_analytics) lines.push('Advanced analytics')
    return lines
  }

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-1', statusColor(user?.subscription_status || ''))}>
                {user?.subscription_status || 'TRIAL'}
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <p className="font-semibold mt-1">{planName || 'Free Trial'}</p>
            </div>
            {planPrice && (
              <div>
                <p className="text-sm text-muted-foreground">Monthly Rate</p>
                <p className="font-semibold mt-1">{formatCurrency(planPrice)}/mo</p>
              </div>
            )}
            {isTrial && user?.trial_ends_at && (
              <div>
                <p className="text-sm text-muted-foreground">Trial Ends</p>
                <p className="font-semibold mt-1">{formatDate(user.trial_ends_at)}</p>
              </div>
            )}
          </div>

          {isTrial && trialDays !== null && (
            <div className={cn(
              'rounded-lg border p-4',
              trialDays <= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            )}>
              <div className="flex items-center gap-2">
                <Clock className={cn('h-5 w-5', trialDays <= 3 ? 'text-red-600' : 'text-amber-600')} />
                <div>
                  <p className={cn('font-semibold', trialDays <= 3 ? 'text-red-900' : 'text-amber-900')}>
                    {trialDays > 0
                      ? `${trialDays} day${trialDays !== 1 ? 's' : ''} remaining in your trial`
                      : 'Your trial has expired'}
                  </p>
                  <p className={cn('text-sm mt-0.5', trialDays <= 3 ? 'text-red-700' : 'text-amber-700')}>
                    {trialDays > 0
                      ? 'Select a plan below to continue using SalonHub after your trial ends.'
                      : 'Your shop is limited. Please upgrade to restore full access.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {user?.subscription_status === 'SUSPENDED' && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="font-semibold text-red-900">Account Suspended</p>
              <p className="text-sm text-red-700 mt-1">Contact support to reactivate your account.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {isTrial || !currentPlanId ? 'Choose a Plan' : 'Change Plan'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan: any) => {
            const isCurrent = plan.id === currentPlanId
            const currentPlanIdx = plans.findIndex((p: any) => p.id === currentPlanId)
            const thisPlanIdx = plans.findIndex((p: any) => p.id === plan.id)
            const isUpgrade = thisPlanIdx > currentPlanIdx && currentPlanId
            const isDowngrade = thisPlanIdx < currentPlanIdx && currentPlanId

            return (
              <Card key={plan.id} className={cn(
                'transition-all border-2',
                isCurrent ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              )}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold">{plan.name}</h4>
                    {isCurrent && <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">Current</span>}
                  </div>
                  <div className="text-2xl font-extrabold mb-1">
                    {formatCurrency(plan.price_per_month)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{plan.description}</p>
                  <ul className="space-y-1.5 text-xs flex-1 mb-4">
                    {getPlanFeatures(plan).map(f => (
                      <li key={f} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant={isUpgrade ? 'default' : 'outline'}
                      loading={upgradeMutation.isPending && changingPlan === plan.id}
                      onClick={() => { setChangingPlan(plan.id); upgradeMutation.mutate(plan.id) }}
                      className="w-full gap-1"
                    >
                      {isUpgrade ? <><ArrowUp className="h-3.5 w-3.5" /> Upgrade</> :
                       isDowngrade ? <><ArrowDown className="h-3.5 w-3.5" /> Downgrade</> :
                       'Select Plan'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          All plans include a 14-day free trial. Contact support for invoicing and payment assistance.
        </p>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const qc = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [savingShop, setSavingShop] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const { data: shop } = useQuery({
    queryKey: ['settings-shop'],
    queryFn: () => settingsApi.getShop().then(r => r.data),
  })

  const { data: staff } = useQuery({
    queryKey: ['staff-list'],
    queryFn: () => settingsApi.staff.list().then(r => r.data),
  })

  const shopForm = useForm({ defaultValues: shop })
  const passwordForm = useForm()
  const staffForm = useForm()

  const handleSaveShop = async (data: any) => {
    setSavingShop(true)
    try {
      await settingsApi.updateShop(data)
      qc.invalidateQueries({ queryKey: ['settings-shop'] })
      toast.success('Shop settings saved!')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally {
      setSavingShop(false)
    }
  }

  const handleChangePassword = async (data: any) => {
    if (data.new_password !== data.confirm_password) {
      toast.error('Passwords do not match'); return
    }
    setSavingPassword(true)
    try {
      await settingsApi.updatePassword({ current_password: data.current_password, new_password: data.new_password })
      toast.success('Password updated!')
      passwordForm.reset()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleAddStaff = async (data: any) => {
    try {
      await settingsApi.staff.create(data)
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      toast.success('Staff member added!')
      staffForm.reset()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to add staff')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="shop">
        <TabsList>
          <TabsTrigger value="shop">Shop</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="shop" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Shop Details</CardTitle>
              <CardDescription>Update your business information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={shopForm.handleSubmit(handleSaveShop)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Business Name</Label>
                    <Input {...shopForm.register('business_name')} defaultValue={shop?.business_name} className="mt-1" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input {...shopForm.register('phone')} defaultValue={shop?.phone} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Address</Label>
                  <Input {...shopForm.register('address')} defaultValue={shop?.address} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>City</Label>
                    <Input {...shopForm.register('city')} defaultValue={shop?.city} className="mt-1" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input {...shopForm.register('country')} defaultValue={shop?.country} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea {...shopForm.register('description')} defaultValue={shop?.description} className="mt-1" rows={3} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Opening Time</Label>
                    <Input {...shopForm.register('opening_time')} type="time" defaultValue={shop?.opening_time} className="mt-1" />
                  </div>
                  <div>
                    <Label>Closing Time</Label>
                    <Input {...shopForm.register('closing_time')} type="time" defaultValue={shop?.closing_time} className="mt-1" />
                  </div>
                  <div>
                    <Label>Buffer (min)</Label>
                    <Input {...shopForm.register('service_buffer_minutes')} type="number" defaultValue={shop?.service_buffer_minutes} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Currency</Label>
                    <Input {...shopForm.register('currency_code')} defaultValue={shop?.currency_code} placeholder="KES" className="mt-1" />
                  </div>
                  <div>
                    <Label>Tax %</Label>
                    <Input {...shopForm.register('tax_percentage')} type="number" step="0.01" defaultValue={shop?.tax_percentage} className="mt-1" />
                  </div>
                </div>
                <Button type="submit" loading={savingShop}>Save Changes</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="mt-4">
          <SubscriptionTab />
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Staff Members</CardTitle>
              <CardDescription>Manage who has access to your shop dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                {staff?.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-sm text-muted-foreground">{s.email}</p>
                    </div>
                    <Badge variant="secondary">{s.role}</Badge>
                  </div>
                ))}
                {(!staff?.length) && <p className="text-sm text-muted-foreground">No staff members yet</p>}
              </div>

              <form onSubmit={staffForm.handleSubmit(handleAddStaff)} className="space-y-3 border-t pt-4">
                <p className="font-medium text-sm">Add Staff Member</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input {...staffForm.register('first_name')} placeholder="First Name" />
                  <Input {...staffForm.register('last_name')} placeholder="Last Name" />
                </div>
                <Input {...staffForm.register('email')} type="email" placeholder="Email" />
                <Input {...staffForm.register('password')} type="password" placeholder="Password" />
                <Button type="submit" size="sm">Add Staff</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-4 max-w-sm">
                <div>
                  <Label>Current Password</Label>
                  <Input {...passwordForm.register('current_password')} type="password" className="mt-1" />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input {...passwordForm.register('new_password')} type="password" className="mt-1" />
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <Input {...passwordForm.register('confirm_password')} type="password" className="mt-1" />
                </div>
                <Button type="submit" loading={savingPassword}>Update Password</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
