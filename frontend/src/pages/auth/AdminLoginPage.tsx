import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export function AdminLoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      const res = await authApi.login(data)
      const { access_token, refresh_token, user } = res.data
      if (user.role !== 'SUPER_ADMIN') {
        toast.error('Access denied. This login is for administrators only.')
        return
      }
      setAuth(user, access_token, refresh_token)
      navigate('/admin')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center">
            <Shield className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white block">SalonHub Admin</span>
            <span className="text-xs text-slate-400">Superadmin Portal</span>
          </div>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Admin Sign In</CardTitle>
            <CardDescription className="text-slate-400">Restricted access — authorised personnel only</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label className="text-slate-300">Admin Email</Label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="admin@example.com"
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-red-500"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <Label className="text-slate-300">Password</Label>
                <Input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-red-500"
                />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>
              <Button
                type="submit"
                loading={isSubmitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                Sign in to Admin Panel
              </Button>
            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
