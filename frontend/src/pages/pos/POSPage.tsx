import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Search,
  User, Printer, Receipt, X, Package, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { servicesApi, customersApi, accountingApi } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  type: 'service' | 'package'
  service_id?: string
  package_id?: string
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CREDIT', label: 'Credit (Debt)' },
]

const CATEGORIES = ['All', 'Hair', 'Makeup', 'Nails', 'Skin', 'Massage', 'Beard', 'Other']

export function POSPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()

  const [cart, setCart] = useState<CartItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentReference, setPaymentReference] = useState('')
  const [discount, setDiscount] = useState(0)
  const [isPartial, setIsPartial] = useState(false)
  const [partialAmount, setPartialAmount] = useState(0)
  const [productTab, setProductTab] = useState('services')
  const [serviceSearch, setServiceSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [receiptData, setReceiptData] = useState<any>(null)

  const { data: servicesData } = useQuery({
    queryKey: ['pos-services'],
    queryFn: () => servicesApi.list({ limit: 200 }).then(r => r.data.data),
  })
  const { data: packagesData } = useQuery({
    queryKey: ['pos-packages'],
    queryFn: () => servicesApi.packages.list({ limit: 100 }).then(r => r.data.data),
  })
  const { data: customersData } = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => customersApi.list({ limit: 300 }).then(r => r.data.data),
  })

  const services = (servicesData || []).filter((s: any) => s.is_active)
  const packages = (packagesData || []).filter((p: any) => p.is_active !== false)
  const filteredServices = services.filter((s: any) => {
    const matchSearch = !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())
    const matchCat = categoryFilter === 'All' || s.category === categoryFilter
    return matchSearch && matchCat
  })

  const addToCart = useCallback((item: Omit<CartItem, 'qty'>) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }, [])
  const updateQty = (id: string, delta: number) =>
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0))
  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id))

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountAmount = Math.min(discount, subtotal)
  const total = subtotal - discountAmount
  const amountNow = isPartial ? Math.min(Math.max(partialAmount, 0), total) : total
  const remainingDebt = isPartial ? total - amountNow : 0
  const selectedCustomer = customersData?.find((c: any) => c.id === customerId)

  // Both credit AND partial-with-remaining require a customer
  const creditNeedsCustomer = paymentMethod === 'CREDIT' && !customerId
  const partialNeedsCustomer = isPartial && remainingDebt > 0 && !customerId
  const needsCustomer = creditNeedsCustomer || partialNeedsCustomer
  const canCheckout = cart.length > 0 && !needsCustomer && (!isPartial || amountNow > 0)

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const invoiceRes = await accountingApi.invoices.create({
        customer_id: customerId || null,
        items: cart.map(item => ({
          description: item.name,
          service_id: item.service_id || null,
          package_id: item.package_id || null,
          quantity: item.qty,
          unit_price: item.price,
        })),
        tax_amount: 0,
        discount_amount: discountAmount,
        due_date: null,
        notes: null,
      })
      const invoice = invoiceRes.data

      if (paymentMethod !== 'CREDIT' && amountNow > 0) {
        await accountingApi.payments.create({
          invoice_id: invoice.id,
          payment_method: paymentMethod,
          amount_paid: amountNow,
          payment_reference: paymentReference || null,
          notes: null,
        })
      }
      return invoice
    },
    onSuccess: (invoice) => {
      setReceiptData({
        invoice_number: invoice.invoice_number,
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : 'Walk-in',
        customer_phone: selectedCustomer?.phone || '',
        items: [...cart],
        subtotal,
        discount: discountAmount,
        total,
        amount_paid: amountNow,
        remaining: remainingDebt,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        is_credit: paymentMethod === 'CREDIT',
        is_partial: isPartial && remainingDebt > 0,
        date: new Date().toLocaleString(),
        business_name: user?.business_name || 'SalonHub',
      })
      setCart([])
      setCustomerId('')
      setPaymentMethod('CASH')
      setPaymentReference('')
      setDiscount(0)
      setIsPartial(false)
      setPartialAmount(0)
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: any) => toast.error(e.message || e.response?.data?.error || 'Checkout failed'),
  })

  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">Point of Sale</h1>
        <Badge variant="outline" className="gap-1 text-sm">
          <ShoppingCart className="h-3.5 w-3.5" /> {cartCount} item{cartCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* LEFT: Service/Package grid */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex gap-2 mb-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search services..."
                value={serviceSearch}
                onChange={e => setServiceSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Tabs value={productTab} onValueChange={setProductTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="flex-shrink-0 mb-2 w-fit">
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="packages">Packages</TabsTrigger>
            </TabsList>

            <TabsContent value="services" className="flex flex-col flex-1 min-h-0 mt-0">
              <div className="flex gap-1.5 flex-wrap mb-3 flex-shrink-0">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      categoryFilter === cat
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No services found</p>
                    <a href="/services" className="text-xs text-primary hover:underline mt-1">Add services →</a>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                    {filteredServices.map((svc: any) => {
                      const inCart = cart.find(c => c.id === svc.id)
                      return (
                        <button
                          key={svc.id}
                          onClick={() => addToCart({ id: svc.id, name: svc.name, price: svc.base_price, type: 'service', service_id: svc.id })}
                          className={cn(
                            'relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md active:scale-95',
                            inCart ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                          )}
                        >
                          {inCart && (
                            <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                              {inCart.qty}
                            </span>
                          )}
                          <div className="text-xs text-muted-foreground mb-1">{svc.category}</div>
                          <div className="font-semibold text-sm leading-tight mb-2 line-clamp-2">{svc.name}</div>
                          <div className="font-bold text-primary text-sm">{formatCurrency(svc.base_price)}</div>
                          <div className="text-xs text-muted-foreground">{svc.duration_minutes} min</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="packages" className="flex flex-col flex-1 min-h-0 mt-0">
              <div className="overflow-y-auto flex-1">
                {packages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No packages yet</p>
                    <a href="/services" className="text-xs text-primary hover:underline mt-1">Create packages →</a>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                    {packages.map((pkg: any) => {
                      const inCart = cart.find(c => c.id === `pkg-${pkg.id}`)
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => addToCart({ id: `pkg-${pkg.id}`, name: pkg.name, price: pkg.package_price, type: 'package', package_id: pkg.id })}
                          className={cn(
                            'relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md active:scale-95',
                            inCart ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                          )}
                        >
                          {inCart && (
                            <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                              {inCart.qty}
                            </span>
                          )}
                          <Package className="h-4 w-4 text-primary mb-1" />
                          <div className="font-semibold text-sm leading-tight mb-2 line-clamp-2">{pkg.name}</div>
                          <div className="font-bold text-primary text-sm">{formatCurrency(pkg.package_price)}</div>
                          {pkg.discount_percentage > 0 && (
                            <div className="text-xs text-green-600">{pkg.discount_percentage}% off</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT: Cart + Checkout */}
        <div className="w-80 lg:w-96 flex-shrink-0 flex flex-col min-h-0">
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> Order
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 min-h-0 gap-3 p-4 pt-0">
              {/* Customer selector */}
              <div className="flex-shrink-0">
                <Label className="text-xs text-muted-foreground">Customer</Label>
                <Select
                  value={customerId || 'walkin'}
                  onValueChange={v => setCustomerId(v === 'walkin' ? '' : v)}
                >
                  <SelectTrigger className={cn(
                    'mt-1 h-9 text-sm',
                    needsCustomer && 'border-destructive ring-1 ring-destructive'
                  )}>
                    <SelectValue placeholder="Walk-in customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">
                      <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Walk-in</span>
                    </SelectItem>
                    {customersData?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}{c.phone ? ` — ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                    <ShoppingCart className="h-6 w-6 mb-1 opacity-30" />
                    <p className="text-xs">Tap a service to add it</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} each</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.id, -1)} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-sm font-semibold w-16 text-right">{formatCurrency(item.price * item.qty)}</div>
                        <button onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals + Payment */}
              {cart.length > 0 && (
                <div className="flex-shrink-0 space-y-3 border-t pt-3">
                  {/* Discount */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Discount (KES)</Label>
                    <Input
                      type="number" min="0" max={subtotal}
                      value={discount || ''}
                      onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Summary */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount</span><span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t pt-1">
                      <span>Total</span><span>{formatCurrency(total)}</span>
                    </div>
                  </div>

                  {/* Payment method */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Payment Method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={v => { setPaymentMethod(v); setIsPartial(false); setPartialAmount(0) }}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reference */}
                  {(paymentMethod === 'MPESA' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Reference (optional)</Label>
                      <Input
                        value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                        placeholder={paymentMethod === 'MPESA' ? 'M-Pesa code' : 'Reference #'}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                  )}

                  {/* Partial payment toggle (non-credit only) */}
                  {paymentMethod !== 'CREDIT' && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isPartial}
                        onChange={e => {
                          setIsPartial(e.target.checked)
                          setPartialAmount(e.target.checked ? Math.floor(total / 2) : 0)
                        }}
                        className="rounded"
                      />
                      <span className="text-xs text-muted-foreground">Partial payment (rest becomes debt)</span>
                    </label>
                  )}

                  {/* Partial amount input */}
                  {isPartial && paymentMethod !== 'CREDIT' && (
                    <div className="space-y-1.5">
                      <div>
                        <Label className="text-xs text-muted-foreground">Amount paying now (KES)</Label>
                        <Input
                          type="number" min="1" max={total - 1}
                          value={partialAmount || ''}
                          onChange={e => setPartialAmount(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                      {amountNow > 0 && amountNow < total && (
                        <div className="text-xs space-y-0.5">
                          <div className="flex justify-between text-green-700 font-medium">
                            <span>Paying now</span><span>{formatCurrency(amountNow)}</span>
                          </div>
                          <div className="flex justify-between text-amber-700 font-medium">
                            <span>Remaining debt</span><span>{formatCurrency(remainingDebt)}</span>
                          </div>
                        </div>
                      )}
                      {/* Partial requires customer — hard error */}
                      {partialNeedsCustomer && (
                        <div className="flex gap-1.5 items-start text-xs bg-red-50 border border-red-200 rounded p-2 text-red-800">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>A customer must be selected to record a debt.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Credit requires customer */}
                  {paymentMethod === 'CREDIT' && (
                    <div className={cn(
                      'flex gap-1.5 items-start text-xs rounded p-2',
                      creditNeedsCustomer
                        ? 'bg-red-50 border border-red-200 text-red-800'
                        : 'bg-amber-50 border border-amber-200 text-amber-800'
                    )}>
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        {creditNeedsCustomer
                          ? 'A customer must be selected to record a debt.'
                          : `Full amount of ${formatCurrency(total)} will be recorded as debt for ${selectedCustomer?.first_name}.`}
                      </span>
                    </div>
                  )}

                  <Button
                    className="w-full gap-2"
                    disabled={!canCheckout}
                    loading={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate()}
                  >
                    <Receipt className="h-4 w-4" />
                    {paymentMethod === 'CREDIT'
                      ? `Record Debt — ${formatCurrency(total)}`
                      : isPartial && amountNow > 0 && amountNow < total
                        ? `Pay ${formatCurrency(amountNow)} · Debt ${formatCurrency(remainingDebt)}`
                        : `Charge ${formatCurrency(total)}`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Receipt Dialog */}
      <Dialog open={!!receiptData} onOpenChange={() => setReceiptData(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold">
                {receiptData?.is_credit ? 'Debt Recorded' : receiptData?.is_partial ? 'Partial Payment' : 'Payment Successful'}
              </span>
            </div>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4">
              <div id="receipt" className="border rounded-lg p-4 font-mono text-xs space-y-3">
                <div className="text-center">
                  <p className="font-bold text-sm">{receiptData.business_name}</p>
                  <p className="text-muted-foreground">{receiptData.date}</p>
                  <p className="text-muted-foreground">{receiptData.invoice_number}</p>
                </div>
                <div className="border-t pt-2">
                  <p><strong>Customer:</strong> {receiptData.customer_name}</p>
                  {receiptData.customer_phone && <p><strong>Phone:</strong> {receiptData.customer_phone}</p>}
                </div>
                <div className="border-t pt-2 space-y-1">
                  {receiptData.items.map((item: CartItem, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>{item.qty > 1 ? `${item.qty}x ` : ''}{item.name}</span>
                      <span>{formatCurrency(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(receiptData.subtotal)}</span></div>
                  {receiptData.discount > 0 && (
                    <div className="flex justify-between text-green-700"><span>Discount</span><span>-{formatCurrency(receiptData.discount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold"><span>TOTAL</span><span>{formatCurrency(receiptData.total)}</span></div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Paid</span>
                    <span>
                      {receiptData.is_credit ? 'CREDIT (DEBT)' : formatCurrency(receiptData.amount_paid)}
                      {receiptData.payment_method && !receiptData.is_credit ? ` (${receiptData.payment_method})` : ''}
                    </span>
                  </div>
                  {receiptData.is_partial && receiptData.remaining > 0 && (
                    <div className="flex justify-between text-amber-700"><span>Balance due</span><span>{formatCurrency(receiptData.remaining)}</span></div>
                  )}
                  {receiptData.payment_reference && (
                    <div className="flex justify-between text-muted-foreground"><span>Ref</span><span>{receiptData.payment_reference}</span></div>
                  )}
                </div>
                <div className="text-center border-t pt-2 text-muted-foreground">Thank you for your visit!</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button className="flex-1" onClick={() => setReceiptData(null)}>New Sale</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
