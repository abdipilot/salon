import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withRLS } from '../config/db.js'
import { authenticate } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'
import { paginate, paginateResult } from '../utils/pagination.js'

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  service_id: z.string().uuid().optional().nullable(),
  package_id: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().int().min(1).default(1),
  unit_price: z.coerce.number().min(0),
})

const invoiceSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1),
  tax_amount: z.coerce.number().min(0).default(0),
  discount_amount: z.coerce.number().min(0).default(0),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  payment_method: z.enum(['CASH', 'CARD', 'MPESA', 'BANK_TRANSFER', 'CREDIT']),
  amount_paid: z.coerce.number().min(0.01),
  payment_reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const expenseSchema = z.object({
  category: z.string().min(1).max(100).default('General'),
  description: z.string().min(1).max(300),
  amount: z.coerce.number().min(0.01),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  payment_method: z.enum(['CASH', 'CARD', 'MPESA', 'BANK_TRANSFER', 'CREDIT']).default('CASH'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

async function getNextInvoiceNumber(client: import('pg').PoolClient, shopId: string): Promise<string> {
  const result = await client.query(
    'SELECT COUNT(*) as cnt FROM invoices WHERE shop_id = $1', [shopId]
  )
  const next = parseInt(result.rows[0].cnt) + 1
  return `INV-${String(next).padStart(4, '0')}`
}

export async function accountingRoutes(fastify: FastifyInstance) {
  const opts = { preHandler: authenticate }

  // ── INVOICES ─────────────────────────────────────────────────────────────────

  fastify.get('/invoices', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20, status, from, to } = request.query as {
      page?: number; limit?: number; status?: string; from?: string; to?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      const conditions = ['i.shop_id = $1']
      if (status) { params.push(status); conditions.push(`i.payment_status = $${params.length}`) }
      if (from) { params.push(from); conditions.push(`i.invoice_date >= $${params.length}`) }
      if (to) { params.push(to); conditions.push(`i.invoice_date <= $${params.length}`) }

      const where = conditions.join(' AND ')
      const count = await client.query(`SELECT COUNT(*) FROM invoices i WHERE ${where}`, params)
      const data = await client.query(
        `SELECT i.*,
                c.first_name || ' ' || c.last_name as customer_name,
                c.phone as customer_phone,
                (SELECT STRING_AGG(d, ', ') FROM
                 (SELECT description as d FROM invoice_items WHERE invoice_id = i.id ORDER BY created_at LIMIT 3) sub
                ) as items_summary
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
         WHERE ${where} ORDER BY i.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(result.rows, result.total, p, l))
  })

  fastify.get('/invoices/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const inv = await client.query(
        `SELECT i.*, c.first_name || ' ' || c.last_name as customer_name, c.phone as customer_phone, c.email as customer_email
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1 AND i.shop_id = $2`,
        [id, shop_id]
      )
      if (inv.rows.length === 0) return null
      const items = await client.query(
        `SELECT ii.*, srv.name as service_name, pkg.name as package_name
         FROM invoice_items ii
         LEFT JOIN services srv ON srv.id = ii.service_id
         LEFT JOIN service_packages pkg ON pkg.id = ii.package_id
         WHERE ii.invoice_id = $1`,
        [id]
      )
      const payments = await client.query(
        `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC`, [id]
      )
      return { ...inv.rows[0], items: items.rows, payments: payments.rows }
    })
    if (!result) return reply.status(404).send(Errors.NOT_FOUND('Invoice'))
    return reply.send(result)
  })

  fastify.post('/invoices', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = invoiceSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { customer_id, items, tax_amount, discount_amount, due_date, notes } = body.data
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    const total_amount = subtotal + tax_amount - discount_amount

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const invoiceNumber = await getNextInvoiceNumber(client, shop_id!)

      const inv = await client.query(
        `INSERT INTO invoices (shop_id, customer_id, invoice_number, total_amount, tax_amount, discount_amount, due_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [shop_id, customer_id || null, invoiceNumber, total_amount, tax_amount, discount_amount,
         due_date || null, notes || null]
      )
      const invoiceId = inv.rows[0].id

      for (const item of items) {
        const total_price = item.unit_price * item.quantity
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, service_id, package_id, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoiceId, item.description, item.service_id || null, item.package_id || null,
           item.quantity, item.unit_price, total_price]
        )
      }

      // Create debt record if there's a customer
      if (customer_id && total_amount > 0) {
        await client.query(
          `INSERT INTO customer_debts (shop_id, customer_id, invoice_id, original_amount, remaining_amount, due_date)
           VALUES ($1, $2, $3, $4, $4, $5)
           ON CONFLICT DO NOTHING`,
          [shop_id, customer_id, invoiceId, total_amount, due_date || null]
        )
      }

      return inv
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/invoices/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = invoiceSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { notes, due_date } = body.data
    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE invoices SET notes = COALESCE($2, notes), due_date = COALESCE($3, due_date), updated_at = NOW()
         WHERE id = $1 AND shop_id = $4 RETURNING *`,
        [id, notes, due_date, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Invoice'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/invoices/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `DELETE FROM invoices WHERE id = $1 AND shop_id = $2 AND payment_status = 'PENDING' RETURNING id`,
        [id, shop_id]
      )
    })
    if (result.rows.length === 0) {
      return reply.status(400).send({ error: 'Cannot delete paid or partial invoices', code: 'CONFLICT', status: 400 })
    }
    return reply.send({ message: 'Invoice deleted' })
  })

  // ── PAYMENTS ─────────────────────────────────────────────────────────────────

  fastify.get('/payments', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20, method, from, to } = request.query as {
      page?: number; limit?: number; method?: string; from?: string; to?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      const conditions = ['p.shop_id = $1']
      if (method) { params.push(method); conditions.push(`p.payment_method = $${params.length}`) }
      if (from) { params.push(from); conditions.push(`DATE(p.paid_at) >= $${params.length}`) }
      if (to) { params.push(to); conditions.push(`DATE(p.paid_at) <= $${params.length}`) }

      const where = conditions.join(' AND ')
      const count = await client.query(`SELECT COUNT(*) FROM payments p WHERE ${where}`, params)
      const data = await client.query(
        `SELECT p.*, i.invoice_number, c.first_name || ' ' || c.last_name as customer_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE ${where} ORDER BY p.paid_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(result.rows, result.total, p, l))
  })

  fastify.post('/payments', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = paymentSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { invoice_id, payment_method, amount_paid, payment_reference, notes } = body.data

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const inv = await client.query(
        `SELECT * FROM invoices WHERE id = $1 AND shop_id = $2`, [invoice_id, shop_id]
      )
      if (inv.rows.length === 0) throw Errors.NOT_FOUND('Invoice')

      const invoice = inv.rows[0]
      if (invoice.payment_status === 'PAID') {
        throw new Error('Invoice already fully paid')
      }

      const newAmountPaid = parseFloat(invoice.amount_paid) + amount_paid
      let newStatus = 'PARTIAL'
      if (newAmountPaid >= parseFloat(invoice.total_amount)) newStatus = 'PAID'

      await client.query(
        `UPDATE invoices SET amount_paid = $2, payment_status = $3, updated_at = NOW() WHERE id = $1`,
        [invoice_id, newAmountPaid, newStatus]
      )

      const payment = await client.query(
        `INSERT INTO payments (invoice_id, shop_id, payment_method, amount_paid, payment_reference, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [invoice_id, shop_id, payment_method, amount_paid, payment_reference || null, notes || null]
      )

      // Update customer total_spent and debt
      if (invoice.customer_id) {
        await client.query(
          `UPDATE customers SET total_spent = total_spent + $1, updated_at = NOW() WHERE id = $2`,
          [amount_paid, invoice.customer_id]
        )
        await client.query(
          `UPDATE customer_debts SET remaining_amount = GREATEST(0, remaining_amount - $1),
           status = CASE WHEN remaining_amount - $1 <= 0 THEN 'PAID'
                        WHEN remaining_amount - $1 < original_amount THEN 'PARTIALLY_PAID'
                        ELSE status END,
           updated_at = NOW()
           WHERE invoice_id = $2`,
          [amount_paid, invoice_id]
        )
      }

      return payment
    })
    return reply.status(201).send(result.rows[0])
  })

  // ── DEBTS ────────────────────────────────────────────────────────────────────

  fastify.get('/debts', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20, status } = request.query as { page?: number; limit?: number; status?: string }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      let extra = ''
      if (status) { params.push(status); extra = ` AND d.status = $${params.length}` }

      const count = await client.query(
        `SELECT COUNT(*) FROM customer_debts d WHERE d.shop_id = $1${extra}`, params
      )

      // Aging buckets
      const aging = await client.query(
        `SELECT
           SUM(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN remaining_amount ELSE 0 END) as current_amount,
           SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN remaining_amount ELSE 0 END) as days_30,
           SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN remaining_amount ELSE 0 END) as days_60,
           SUM(CASE WHEN due_date < CURRENT_DATE - 60 THEN remaining_amount ELSE 0 END) as days_90_plus,
           SUM(remaining_amount) as total_outstanding
         FROM customer_debts WHERE shop_id = $1 AND status IN ('ACTIVE','PARTIALLY_PAID')`,
        [shop_id]
      )

      const data = await client.query(
        `SELECT d.*, c.first_name || ' ' || c.last_name as customer_name, c.phone as customer_phone,
                i.invoice_number
         FROM customer_debts d
         JOIN customers c ON c.id = d.customer_id
         LEFT JOIN invoices i ON i.id = d.invoice_id
         WHERE d.shop_id = $1${extra} ORDER BY d.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )

      return {
        aging: aging.rows[0],
        rows: data.rows,
        total: parseInt(count.rows[0].count),
      }
    })

    return reply.send({
      aging: result.aging,
      ...paginateResult(result.rows, result.total, p, l),
    })
  })

  fastify.get('/debts/:customerId', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { customerId } = request.params as { customerId: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `SELECT d.*, i.invoice_number FROM customer_debts d
         LEFT JOIN invoices i ON i.id = d.invoice_id
         WHERE d.customer_id = $1 AND d.shop_id = $2 ORDER BY d.created_at DESC`,
        [customerId, shop_id]
      )
    })
    return reply.send(result.rows)
  })

  // ── REPORTS ──────────────────────────────────────────────────────────────────

  fastify.get('/reports/revenue', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { period = 'week' } = request.query as { period?: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      let dateFormat = 'YYYY-MM-DD'
      let interval = `7 days`
      if (period === 'month') { dateFormat = 'YYYY-MM-DD'; interval = '30 days' }
      if (period === 'year') { dateFormat = 'YYYY-MM'; interval = '12 months' }

      return client.query(
        `SELECT TO_CHAR(DATE(p.paid_at), $3) as date,
                SUM(p.amount_paid) as revenue,
                COUNT(DISTINCT p.invoice_id) as transactions
         FROM payments p
         WHERE p.shop_id = $1 AND p.paid_at >= NOW() - INTERVAL '${interval}'
         GROUP BY 1 ORDER BY 1`,
        [shop_id, interval, dateFormat]
      )
    })
    return reply.send(result.rows)
  })

  fastify.get('/reports/services', opts, async (request, reply) => {
    const { shop_id, role } = request.user

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `SELECT srv.name, srv.category, srv.base_price,
                COUNT(DISTINCT ii.invoice_id) as invoice_count,
                SUM(ii.total_price) as total_revenue
         FROM invoice_items ii
         JOIN services srv ON srv.id = ii.service_id
         JOIN invoices i ON i.id = ii.invoice_id AND i.payment_status IN ('PAID','PARTIAL')
         WHERE i.shop_id = $1
         GROUP BY srv.id, srv.name, srv.category, srv.base_price
         ORDER BY total_revenue DESC LIMIT 20`,
        [shop_id]
      )
    })
    return reply.send(result.rows)
  })

  fastify.get('/reports/customers', opts, async (request, reply) => {
    const { shop_id, role } = request.user

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const [overview, topSpenders, monthly] = await Promise.all([
        client.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month,
                  AVG(total_spent) as avg_spent,
                  SUM(total_spent) as total_revenue
           FROM customers WHERE shop_id = $1`,
          [shop_id]
        ),
        client.query(
          `SELECT first_name || ' ' || last_name as name, phone, total_spent, loyalty_points
           FROM customers WHERE shop_id = $1 ORDER BY total_spent DESC LIMIT 10`,
          [shop_id]
        ),
        client.query(
          `SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_customers
           FROM customers WHERE shop_id = $1 AND created_at >= NOW() - INTERVAL '6 months'
           GROUP BY 1 ORDER BY 1`,
          [shop_id]
        ),
      ])
      return { overview: overview.rows[0], top_spenders: topSpenders.rows, monthly: monthly.rows }
    })
    return reply.send(result)
  })

  fastify.get('/reports/debt-aging', opts, async (request, reply) => {
    const { shop_id, role } = request.user

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `SELECT
           COUNT(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 1 END) as current_count,
           SUM(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN remaining_amount ELSE 0 END) as current_amount,
           COUNT(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN 1 END) as days_30_count,
           SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN remaining_amount ELSE 0 END) as days_30_amount,
           COUNT(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN 1 END) as days_60_count,
           SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN remaining_amount ELSE 0 END) as days_60_amount,
           COUNT(CASE WHEN due_date < CURRENT_DATE - 60 THEN 1 END) as days_90_plus_count,
           SUM(CASE WHEN due_date < CURRENT_DATE - 60 THEN remaining_amount ELSE 0 END) as days_90_plus_amount
         FROM customer_debts WHERE shop_id = $1 AND status IN ('ACTIVE','PARTIALLY_PAID')`,
        [shop_id]
      )
    })
    return reply.send(result.rows[0])
  })

  // Dashboard stats
  fastify.get('/stats', opts, async (request, reply) => {
    const { shop_id, role } = request.user

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const [revenue, pending, debts, todayAppt] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE shop_id = $1 AND DATE(paid_at) >= DATE_TRUNC('month', NOW())`,
          [shop_id]
        ),
        client.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(total_amount - amount_paid), 0) as amount FROM invoices WHERE shop_id = $1 AND payment_status IN ('PENDING','PARTIAL')`,
          [shop_id]
        ),
        client.query(
          `SELECT COALESCE(SUM(remaining_amount), 0) as total FROM customer_debts WHERE shop_id = $1 AND status IN ('ACTIVE','PARTIALLY_PAID')`,
          [shop_id]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM appointments WHERE shop_id = $1 AND appointment_date = CURRENT_DATE AND status NOT IN ('CANCELLED','NO_SHOW')`,
          [shop_id]
        ),
      ])
      return {
        monthly_revenue: parseFloat(revenue.rows[0].total),
        pending_invoices: { count: parseInt(pending.rows[0].count), amount: parseFloat(pending.rows[0].amount) },
        outstanding_debts: parseFloat(debts.rows[0].total),
        appointments_today: parseInt(todayAppt.rows[0].count),
      }
    })
    return reply.send(result)
  })

  // ── EXPENSES ─────────────────────────────────────────────────────────────────

  fastify.get('/expenses', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 100, period, category } = request.query as {
      page?: number; limit?: number; period?: string; category?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      const conditions = ['e.shop_id = $1']

      if (period === 'week') conditions.push(`e.expense_date >= DATE_TRUNC('week', CURRENT_DATE)`)
      else if (period === 'month') conditions.push(`e.expense_date >= DATE_TRUNC('month', CURRENT_DATE)`)
      else if (period === 'year') conditions.push(`e.expense_date >= DATE_TRUNC('year', CURRENT_DATE)`)

      if (category) { params.push(category); conditions.push(`e.category = $${params.length}`) }

      const where = conditions.join(' AND ')
      const count = await client.query(`SELECT COUNT(*) FROM expenses e WHERE ${where}`, params)
      const data = await client.query(
        `SELECT * FROM expenses e WHERE ${where} ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(result.rows, result.total, p, l))
  })

  fastify.post('/expenses', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = expenseSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { category, description, amount, expense_date, payment_method, reference, notes } = body.data
    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `INSERT INTO expenses (shop_id, category, description, amount, expense_date, payment_method, reference, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [shop_id, category, description, amount, expense_date, payment_method, reference || null, notes || null]
      )
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/expenses/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = expenseSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const cur = await client.query('SELECT * FROM expenses WHERE id = $1 AND shop_id = $2', [id, shop_id])
      if (cur.rows.length === 0) return null
      const d = { ...cur.rows[0], ...body.data }
      return client.query(
        `UPDATE expenses SET category=$2, description=$3, amount=$4, expense_date=$5, payment_method=$6,
         reference=$7, notes=$8, updated_at=NOW() WHERE id=$1 AND shop_id=$9 RETURNING *`,
        [id, d.category, d.description, d.amount, d.expense_date, d.payment_method, d.reference, d.notes, shop_id]
      )
    })
    if (!result) return reply.status(404).send(Errors.NOT_FOUND('Expense'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/expenses/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query('DELETE FROM expenses WHERE id=$1 AND shop_id=$2 RETURNING id', [id, shop_id])
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Expense'))
    return reply.send({ message: 'Expense deleted' })
  })

  // ── PROFIT SUMMARY ────────────────────────────────────────────────────────────

  fastify.get('/reports/profit-summary', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { period = 'month' } = request.query as { period?: string }

    let interval = `DATE_TRUNC('month', CURRENT_DATE)`
    if (period === 'week') interval = `DATE_TRUNC('week', CURRENT_DATE)`
    if (period === 'year') interval = `DATE_TRUNC('year', CURRENT_DATE)`

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const [rev, exp, expCat] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE shop_id=$1 AND paid_at >= ${interval}`,
          [shop_id]
        ),
        client.query(
          `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE shop_id=$1 AND expense_date >= ${interval}`,
          [shop_id]
        ),
        client.query(
          `SELECT category, SUM(amount) as total, COUNT(*) as count
           FROM expenses WHERE shop_id=$1 AND expense_date >= ${interval}
           GROUP BY category ORDER BY total DESC`,
          [shop_id]
        ),
      ])
      const revenue_total = parseFloat(rev.rows[0].total)
      const expenses_total = parseFloat(exp.rows[0].total)
      const net_profit = revenue_total - expenses_total
      return {
        revenue_total,
        expenses_total,
        net_profit,
        margin: revenue_total > 0 ? parseFloat(((net_profit / revenue_total) * 100).toFixed(1)) : 0,
        by_category: expCat.rows,
      }
    })
    return reply.send(result)
  })
}
