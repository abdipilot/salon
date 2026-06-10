import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, Calendar, Users, Receipt, TrendingUp, CreditCard,
  CheckCircle2, ArrowRight, Shield, Zap, Menu, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

const features = [
  { icon: Calendar, title: 'Smart Scheduling', description: 'Manage appointments effortlessly with a visual calendar. Reduce no-shows with automated status tracking.' },
  { icon: Users, title: 'Customer CRM', description: 'Build lasting relationships. Track every customer\'s history, spending, and loyalty points.' },
  { icon: Receipt, title: 'Professional Invoicing', description: 'Create invoices in seconds. Support for partial payments, taxes, and multiple payment methods.' },
  { icon: TrendingUp, title: 'Business Analytics', description: 'Make data-driven decisions with revenue reports, popular services, and customer insights.' },
  { icon: CreditCard, title: 'Debt Tracking', description: 'Never lose track of outstanding payments. Aging reports show exactly who owes what.' },
  { icon: Zap, title: 'Service Packages', description: 'Bundle services into packages with discounts to boost revenue and customer retention.' },
]

function getPlanFeatures(plan: any): string[] {
  const lines: string[] = [
    `Up to ${plan.max_staff >= 9999 ? 'unlimited' : plan.max_staff} staff`,
    `${plan.max_customers >= 99999 ? 'Unlimited' : plan.max_customers.toLocaleString()} customers`,
    `${plan.max_appointments_per_month >= 99999 ? 'Unlimited' : plan.max_appointments_per_month} appointments/mo`,
  ]
  if (plan.features?.staff_management) lines.push('Staff management')
  if (plan.features?.inventory) lines.push('Inventory tracking')
  if (plan.features?.advanced_analytics) lines.push('Advanced analytics')
  return lines
}

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()

  const { data: plans = [] } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => publicApi.plans().then(r => r.data),
  })

  const goToSignup = (planId?: string, planName?: string) => {
    const params = new URLSearchParams()
    if (planId) params.set('plan', planId)
    if (planName) params.set('planName', planName)
    navigate(`/auth/login?${params.toString()}&mode=signup`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-400" />
              <span className="text-xl font-bold">SalonHub</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-white/70 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-white/70 hover:text-white transition-colors">Pricing</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Link to="/auth/login">
                <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white">Log in</Button>
              </Link>
              <Button onClick={() => goToSignup()} className="bg-purple-600 hover:bg-purple-700 text-white">
                Start Free Trial
              </Button>
            </div>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-white/10 py-4 space-y-3">
              <a href="#features" className="block text-sm text-white/70 hover:text-white px-2 py-1" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#pricing" className="block text-sm text-white/70 hover:text-white px-2 py-1" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
              <div className="flex gap-3 pt-2">
                <Link to="/auth/login" className="flex-1">
                  <Button variant="outline" className="w-full border-white/30 text-white bg-transparent hover:bg-white/10">Log in</Button>
                </Link>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => { setMobileMenuOpen(false); goToSignup() }}>
                  Sign up
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Manage your{' '}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              salon business
            </span>
            {' '}effortlessly
          </h1>
          <p className="text-xl text-white/70 max-w-2xl mx-auto mb-10">
            SalonHub is the all-in-one platform for salons, barber shops, and makeup artists.
            Appointments, customers, invoices, and analytics — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={() => goToSignup()} size="lg" className="bg-purple-600 hover:bg-purple-700 text-white gap-2 px-8">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/auth/login">
              <Button size="lg" variant="outline" className="border-white/30 text-white bg-transparent hover:bg-white/10">
                Sign in to dashboard
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-white/50">
            <div className="flex items-center gap-2"><Shield className="h-4 w-4" /> Bank-level security</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Multi-tenant isolation</div>
            <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Built for Africa</div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything you need to run your business</h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">One platform. Zero spreadsheets. Complete control.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-colors">
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 bg-black/20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-white/60 text-lg">Pick the plan that fits your business. Cancel anytime.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {plans.map((plan: any, i: number) => (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 border transition-all flex flex-col w-full sm:w-72 ${
                  i === 0 ? 'bg-purple-600/30 border-purple-500 scale-105' : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {i === 0 && <div className="text-xs font-semibold text-white bg-white/20 rounded-full px-3 py-1 w-fit mb-3">⭐ Best Value</div>}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <div className="text-3xl font-extrabold my-3">
                  {formatCurrency(plan.price_per_month, 'KES')}
                  <span className="text-sm font-normal text-white/60">/mo</span>
                </div>
                <p className="text-white/60 text-sm mb-4">{plan.description}</p>
                <ul className="space-y-2 mb-6 text-sm flex-1">
                  {getPlanFeatures(plan).map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => goToSignup(plan.id, plan.name)}
                  className={`w-full ${
                    i === 0
                      ? 'bg-white text-purple-700 hover:bg-white/90'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  Get started
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-12 px-4">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <span className="font-bold">SalonHub</span>
          </div>
          <p className="text-white/40 text-sm">© {new Date().getFullYear()} SalonHub. All rights reserved.</p>
          <p className="text-white/30 text-xs">
            Powered by{' '}
            <a href="https://somict.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors underline underline-offset-2">
              SomICT
            </a>
          </p>
          <div className="flex gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
