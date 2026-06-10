import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../config/db.js'
import { requireRole } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'
import { paginate, paginateResult } from '../utils/pagination.js'

const planSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price_per_month: z.coerce.number().min(0),
  max_staff: z.coerce.number().int().min(1).default(5),
  max_customers: z.coerce.number().int().min(1).default(100),
  max_appointments_per_month: z.coerce.number().int().min(1).default(200),
  features: z.object({
    advanced_analytics: z.boolean().default(false),
    inventory: z.boolean().default(false),
    staff_management: z.boolean().default(false),
  }).default({}),
  is_active: z.boolean().default(true),
})

const superAdminOnly = { preHandler: requireRole('SUPER_ADMIN') }

export async function adminRoutes(fastify: FastifyInstance) {

  // ── SHOPS ─────────────────────────────────────────────────────────────────

  fastify.get('/shops', superAdminOnly, async (request, reply) => {
    const { page = 1, limit = 20, search, status, category } = request.query as {
      page?: number; limit?: number; search?: string; status?: string; category?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const params: unknown[] = []
    const conditions: string[] = []
    if (search) {
      params.push(`%${search}%`)
      conditions.push(`(s.business_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`)
    }
    if (status) { params.push(status); conditions.push(`s.subscription_status = $${params.length}`) }
    if (category) { params.push(category); conditions.push(`s.category = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const count = await pool.query(
      `SELECT COUNT(*) FROM shops s JOIN users u ON u.id = s.owner_id ${where}`, params
    )
    const data = await pool.query(
      `SELECT s.*,
              u.email as owner_email, u.first_name || ' ' || u.last_name as owner_name,
              sp.name as plan_name,
              EXTRACT(DAYS FROM s.trial_ends_at - NOW()) as trial_days_remaining,
              (SELECT COALESCE(SUM(p.amount_paid), 0) FROM payments p WHERE p.shop_id = s.id AND DATE(p.paid_at) >= DATE_TRUNC('month', NOW())) as mtd_revenue
       FROM shops s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN subscription_plans sp ON sp.id = s.subscription_plan_id
       ${where} ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, l, offset]
    )
    return reply.send(paginateResult(data.rows, parseInt(count.rows[0].count), p, l))
  })

  fastify.get('/shops/:id', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await pool.query(
      `SELECT s.*,
              u.email as owner_email, u.first_name || ' ' || u.last_name as owner_name, u.phone as owner_phone,
              sp.name as plan_name,
              (SELECT COUNT(*) FROM services WHERE shop_id = s.id AND is_active = true) as services_count,
              (SELECT COUNT(*) FROM customers WHERE shop_id = s.id) as customers_count,
              (SELECT COUNT(*) FROM appointments WHERE shop_id = s.id) as appointments_count,
              (SELECT COALESCE(SUM(amount_paid), 0) FROM payments WHERE shop_id = s.id) as total_revenue
       FROM shops s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN subscription_plans sp ON sp.id = s.subscription_plan_id
       WHERE s.id = $1`,
      [id]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    return reply.send(result.rows[0])
  })

  fastify.post('/shops/:id/suspend', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await pool.query(
      `UPDATE shops SET subscription_status = 'SUSPENDED', updated_at = NOW() WHERE id = $1 RETURNING id, business_name, subscription_status`,
      [id]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    return reply.send(result.rows[0])
  })

  fastify.post('/shops/:id/unsuspend', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await pool.query(
      `UPDATE shops SET subscription_status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING id, business_name, subscription_status`,
      [id]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    return reply.send(result.rows[0])
  })

  const shopUpdateSchema = z.object({
    subscription_plan_id: z.string().uuid().optional().nullable(),
    subscription_status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
    business_name: z.string().min(1).max(200).optional(),
    category: z.enum(['SALON', 'BARBER', 'MAKEUP', 'COMBO']).optional(),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
  })

  fastify.put('/shops/:id', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = shopUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const fields = Object.entries(body.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    const values = Object.entries(body.data).filter(([, v]) => v !== undefined).map(([, v]) => v)

    if (fields.length === 0) return reply.status(422).send({ error: 'No fields to update', code: 'INVALID_INPUT', status: 422 })

    const result = await pool.query(
      `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/shops/:id', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const shop = await pool.query('SELECT id FROM shops WHERE id = $1', [id])
    if (shop.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    await pool.query('DELETE FROM users WHERE shop_id = $1', [id])
    await pool.query('DELETE FROM shops WHERE id = $1', [id])
    return reply.send({ message: 'Shop deleted' })
  })

  // ── SUBSCRIPTION PLANS ────────────────────────────────────────────────────

  fastify.get('/subscription-plans', superAdminOnly, async (_req, reply) => {
    const result = await pool.query(
      `SELECT *, (SELECT COUNT(*) FROM shops WHERE subscription_plan_id = sp.id) as shops_count
       FROM subscription_plans sp ORDER BY price_per_month`
    )
    return reply.send(result.rows)
  })

  fastify.post('/subscription-plans', superAdminOnly, async (request, reply) => {
    const body = planSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { name, description, price_per_month, max_staff, max_customers, max_appointments_per_month, features, is_active } = body.data
    const result = await pool.query(
      `INSERT INTO subscription_plans (name, description, price_per_month, max_staff, max_customers, max_appointments_per_month, features, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, description || null, price_per_month, max_staff, max_customers, max_appointments_per_month, JSON.stringify(features), is_active]
    )
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/subscription-plans/:id', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = planSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { features, ...rest } = body.data
    const fields = Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    const values = Object.entries(rest).filter(([, v]) => v !== undefined).map(([, v]) => v)

    if (features !== undefined) {
      fields.push(`features = $${fields.length + 2}`)
      values.push(JSON.stringify(features))
    }

    if (fields.length === 0) return reply.status(422).send({ error: 'No fields to update', code: 'INVALID_INPUT', status: 422 })

    const result = await pool.query(
      `UPDATE subscription_plans SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Plan'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/subscription-plans/:id', superAdminOnly, async (request, reply) => {
    const { id } = request.params as { id: string }
    await pool.query(`UPDATE subscription_plans SET is_active = false WHERE id = $1`, [id])
    return reply.send({ message: 'Plan deactivated' })
  })

  // ── BILLING RECORDS ──────────────────────────────────────────────────────

  fastify.get('/billing-records', superAdminOnly, async (request, reply) => {
    const { page = 1, limit = 20, shop_id, status } = request.query as {
      page?: number; limit?: number; shop_id?: string; status?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const params: unknown[] = []
    const conditions: string[] = []
    if (shop_id) { params.push(shop_id); conditions.push(`br.shop_id = $${params.length}`) }
    if (status) { params.push(status); conditions.push(`br.status = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const count = await pool.query(`SELECT COUNT(*) FROM billing_records br ${where}`, params)
    const data = await pool.query(
      `SELECT br.*, s.business_name, sp.name as plan_name
       FROM billing_records br
       JOIN shops s ON s.id = br.shop_id
       LEFT JOIN subscription_plans sp ON sp.id = br.subscription_plan_id
       ${where} ORDER BY br.billing_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, l, offset]
    )
    return reply.send(paginateResult(data.rows, parseInt(count.rows[0].count), p, l))
  })

  fastify.post('/billing-records/trigger', superAdminOnly, async (request, reply) => {
    const { shop_id, notes } = (request.body as { shop_id?: string; notes?: string }) || {}
    if (!shop_id) return reply.status(422).send({ error: 'shop_id required', code: 'INVALID_INPUT', status: 422 })

    const shop = await pool.query(
      `SELECT s.*, sp.price_per_month FROM shops s
       LEFT JOIN subscription_plans sp ON sp.id = s.subscription_plan_id WHERE s.id = $1`,
      [shop_id]
    )
    if (shop.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))

    const amount = shop.rows[0].price_per_month || 0
    const result = await pool.query(
      `INSERT INTO billing_records (shop_id, subscription_plan_id, amount_due, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [shop_id, shop.rows[0].subscription_plan_id, amount, notes || null]
    )
    return reply.status(201).send(result.rows[0])
  })

  // ── ANALYTICS ─────────────────────────────────────────────────────────────

  fastify.get('/analytics', superAdminOnly, async (_req, reply) => {
    const [kpis, revenueChart, shopsByStatus, shopsByCategory, topShops] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM shops WHERE subscription_status = 'ACTIVE') as active_shops,
          (SELECT COUNT(*) FROM shops) as total_shops,
          (SELECT COUNT(*) FROM shops WHERE subscription_status = 'TRIAL') as trial_shops,
          (SELECT COUNT(*) FROM shops WHERE subscription_status = 'CANCELLED') as cancelled_shops,
          (SELECT COALESCE(SUM(amount_paid), 0) FROM payments WHERE DATE(paid_at) >= DATE_TRUNC('month', NOW())) as mtd_revenue,
          (SELECT COALESCE(SUM(amount_paid), 0) FROM payments) as total_revenue
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM') as month, SUM(amount_paid) as revenue
        FROM payments WHERE paid_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT subscription_status as status, COUNT(*) as count FROM shops GROUP BY 1
      `),
      pool.query(`
        SELECT category, COUNT(*) as count FROM shops GROUP BY 1
      `),
      pool.query(`
        SELECT s.business_name, s.subscription_status, sp.name as plan_name,
               COALESCE(mtd.revenue, 0) as mtd_revenue,
               (SELECT COUNT(*) FROM appointments a WHERE a.shop_id = s.id) as appointments_count,
               (SELECT COUNT(*) FROM customers c WHERE c.shop_id = s.id) as customers_count
        FROM shops s
        LEFT JOIN subscription_plans sp ON sp.id = s.subscription_plan_id
        LEFT JOIN LATERAL (
          SELECT SUM(amount_paid) as revenue FROM payments p
          WHERE p.shop_id = s.id AND DATE(p.paid_at) >= DATE_TRUNC('month', NOW())
        ) mtd ON true
        ORDER BY mtd_revenue DESC NULLS LAST LIMIT 10
      `),
    ])

    return reply.send({
      kpis: kpis.rows[0],
      revenue_chart: revenueChart.rows,
      shops_by_status: shopsByStatus.rows,
      shops_by_category: shopsByCategory.rows,
      top_shops: topShops.rows,
    })
  })

  // ── STAFF MANAGEMENT ────────────────────────────────────────────────────

  fastify.get('/shops/:shopId/staff', superAdminOnly, async (request, reply) => {
    const { shopId } = request.params as { shopId: string }
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, role, status, created_at
       FROM users WHERE shop_id = $1 ORDER BY role, first_name`,
      [shopId]
    )
    return reply.send(result.rows)
  })
}
