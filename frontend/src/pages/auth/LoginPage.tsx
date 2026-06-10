import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles, Package, X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const signupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  business_name: z.string().min(1, 'Business name required'),
  category: z.enum(['SALON', 'BARBER', 'MAKEUP', 'COMBO']),
  terms: z.boolean().refine(v => v === true, 'You must accept the terms'),
})
type SignupForm = z.infer<typeof signupSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()

  const planId = searchParams.get('plan')
  const planName = searchParams.get('planName')
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [successOpen, setSuccessOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('mode') === 'signup') setMode('signup')
  }, [searchParams])

  // ── Login form ────────────────────────────────────────────────────────────
  const loginForm = useForm({ resolver: zodResolver(loginSchema) })

  const onLogin = async (data: z.infer<typeof loginSchema>) => {
    try {
      const res = await authApi.login(data)
      const { access_token, refresh_token, user } = res.data
      if (user.role === 'SUPER_ADMIN') {
        toast.error('Use the admin portal to sign in.')
        return
      }
      setAuth(user, access_token, refresh_token)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed')
    }
  }

  // ── Signup form ───────────────────────────────────────────────────────────
  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { category: 'SALON' },
  })

  const onSignup = async (data: SignupForm) => {
    try {
      const res = await authApi.signup(data)
      const { access_token, refresh_token, user } = res.data
      setAuth(user, access_token, refresh_token)
      setSuccessOpen(true)
      setTimeout(() => navigate('/dashboard'), 3000)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Signup failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Sparkles className="h-7 w-7 text-purple-400" />
          <span className="text-2xl font-bold text-white">SalonHub</span>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-white/10 p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === 'login' ? 'bg-white text-slate-900 shadow' : 'text-white/70 hover:text-white'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === 'signup' ? 'bg-white text-slate-900 shadow' : 'text-white/70 hover:text-white'
            }`}
          >
            Create account
          </button>
        </div>

        {/* Plan banner (signup mode only) */}
        {mode === 'signup' && planName && (
          <div className="mb-4 rounded-xl bg-purple-500/20 border border-purple-500/30 px-4 py-3 flex items-center gap-3">
            <Package className="h-5 w-5 text-purple-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Selected: {planName} plan</p>
              <p className="text-xs text-white/60">You can change your plan anytime from settings.</p>
            </div>
          </div>
        )}

        {mode === 'login' ? (
          <Card>
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>Sign in to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input {...loginForm.register('email')} type="email" placeholder="you@example.com" className="mt-1" />
                  {loginForm.formState.errors.email && (
                    <p className="text-destructive text-xs mt-1">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Password</Label>
                    <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                  </div>
                  <Input {...loginForm.register('password')} type="password" placeholder="••••••••" />
                  {loginForm.formState.errors.password && (
                    <p className="text-destructive text-xs mt-1">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" loading={loginForm.formState.isSubmitting} className="w-full">Sign in</Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Don't have an account?{' '}
                <button onClick={() => setMode('signup')} className="text-primary hover:underline">Create one free</button>
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Create your account</CardTitle>
              <CardDescription>Start managing your salon today</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>First Name</Label>
                    <Input {...signupForm.register('first_name')} placeholder="Jane" className="mt-1" />
                    {signupForm.formState.errors.first_name && (
                      <p className="text-destructive text-xs mt-1">{signupForm.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input {...signupForm.register('last_name')} placeholder="Doe" className="mt-1" />
                    {signupForm.formState.errors.last_name && (
                      <p className="text-destructive text-xs mt-1">{signupForm.formState.errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Business Name</Label>
                  <Input {...signupForm.register('business_name')} placeholder="Jane's Beauty Salon" className="mt-1" />
                  {signupForm.formState.errors.business_name && (
                    <p className="text-destructive text-xs mt-1">{signupForm.formState.errors.business_name.message}</p>
                  )}
                </div>

                <div>
                  <Label>Business Type</Label>
                  <Select onValueChange={(v) => signupForm.setValue('category', v as any)} defaultValue="SALON">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALON">Salon</SelectItem>
                      <SelectItem value="BARBER">Barber Shop</SelectItem>
                      <SelectItem value="MAKEUP">Makeup Artist</SelectItem>
                      <SelectItem value="COMBO">Multi-service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Email</Label>
                  <Input {...signupForm.register('email')} type="email" placeholder="jane@example.com" className="mt-1" />
                  {signupForm.formState.errors.email && (
                    <p className="text-destructive text-xs mt-1">{signupForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <Label>Password</Label>
                  <Input {...signupForm.register('password')} type="password" placeholder="Min. 8 characters" className="mt-1" />
                  {signupForm.formState.errors.password && (
                    <p className="text-destructive text-xs mt-1">{signupForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <input type="checkbox" id="terms" {...signupForm.register('terms')} className="mt-1 accent-purple-500" />
                  <label htmlFor="terms" className="text-sm text-muted-foreground">
                    I agree to the <span className="text-primary cursor-pointer hover:underline">Terms of Service</span> and{' '}
                    <span className="text-primary cursor-pointer hover:underline">Privacy Policy</span>
                  </label>
                </div>
                {signupForm.formState.errors.terms && (
                  <p className="text-destructive text-xs">{signupForm.formState.errors.terms.message}</p>
                )}

                <Button type="submit" loading={signupForm.formState.isSubmitting} className="w-full">
                  Create Free Account
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-primary hover:underline">Sign in</button>
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="text-center">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <DialogTitle>Welcome to SalonHub!</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground mt-2">Your account is ready. Redirecting to your dashboard...</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
