import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { authenticate } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'

const shopSettingsSchema = z.object({
  business_name: z.string().min(1).max(200).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
  opening_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closing_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  currency_code: z.string().length(3).optional(),
  tax_percentage: z.coerce.number().min(0).max(100).optional(),
  service_buffer_minutes: z.coerce.number().int().min(0).max(120).optional(),
  logo_url: z.string().url().optional().or(z.literal('')),
  banner_url: z.string().url().optional().or(z.literal('')),
})

export async function settingsRoutes(fastify: FastifyInstance) {
  const opts = { preHandler: authenticate }

  fastify.get('/shop', opts, async (request, reply) => {
    const { shop_id } = request.user
    if (!shop_id) return reply.status(403).send(Errors.FORBIDDEN())

    const result = await pool.query(`SELECT * FROM shops WHERE id = $1`, [shop_id])
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))
    return reply.send(result.rows[0])
  })

  fastify.put('/shop', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    if (!shop_id || !['SHOP_OWNER'].includes(role)) return reply.status(403).send(Errors.FORBIDDEN())

    const body = shopSettingsSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const fields = Object.entries(body.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    const values = Object.entries(body.data).filter(([, v]) => v !== undefined).map(([, v]) => v)

    if (fields.length === 0) return reply.status(422).send({ error: 'No fields to update', code: 'INVALID_INPUT', status: 422 })

    const result = await pool.query(
      `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [shop_id, ...values]
    )
    return reply.send(result.rows[0])
  })

  fastify.put('/password', opts, async (request, reply) => {
    const { sub } = request.user
    const { current_password, new_password } = (request.body as { current_password?: string; new_password?: string }) || {}
    if (!current_password || !new_password || new_password.length < 8) {
      return reply.status(422).send({ error: 'Current and new password (min 8 chars) required', code: 'INVALID_INPUT', status: 422 })
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [sub])
    if (!(await bcrypt.compare(current_password, result.rows[0].password_hash))) {
      return reply.status(401).send({ error: 'Current password is incorrect', code: 'AUTH_FAILED', status: 401 })
    }

    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, sub])
    return reply.send({ message: 'Password updated' })
  })

  fastify.get('/staff', opts, async (request, reply) => {
    const { shop_id } = request.user
    if (!shop_id) return reply.status(403).send(Errors.FORBIDDEN())

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, role, status, created_at
       FROM users WHERE shop_id = $1 AND role = 'SHOP_STAFF' ORDER BY first_name`,
      [shop_id]
    )
    return reply.send(result.rows)
  })

  fastify.post('/upgrade-plan', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    if (!shop_id || role !== 'SHOP_OWNER') return reply.status(403).send(Errors.FORBIDDEN())

    const { plan_id } = (request.body as { plan_id?: string }) || {}
    if (!plan_id) return reply.status(422).send({ error: 'plan_id required', code: 'INVALID_INPUT', status: 422 })

    const plan = await pool.query('SELECT id FROM subscription_plans WHERE id = $1 AND is_active = true', [plan_id])
    if (plan.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Plan'))

    const result = await pool.query(
      `UPDATE shops SET subscription_plan_id = $1, subscription_status = 'ACTIVE', updated_at = NOW()
       WHERE id = $2 RETURNING id, business_name, subscription_status, subscription_plan_id`,
      [plan_id, shop_id]
    )
    return reply.send(result.rows[0])
  })

  fastify.post('/staff', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    if (!shop_id || role !== 'SHOP_OWNER') return reply.status(403).send(Errors.FORBIDDEN())

    const { email, first_name, last_name, phone, password } = (request.body as Record<string, string>) || {}
    if (!email || !first_name || !last_name || !password) {
      return reply.status(422).send({ error: 'email, first_name, last_name, password required', code: 'INVALID_INPUT', status: 422 })
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) return reply.status(409).send(Errors.CONFLICT('Email already registered'))

    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, shop_id)
       VALUES ($1, $2, $3, $4, $5, 'SHOP_STAFF', $6) RETURNING id, email, first_name, last_name, role`,
      [email, hash, first_name, last_name, phone || null, shop_id]
    )
    return reply.status(201).send(result.rows[0])
  })
}
