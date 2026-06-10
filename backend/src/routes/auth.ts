import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { pool } from '../config/db.js'
import { redis } from '../config/redis.js'
import { env } from '../config/env.js'
import { AppError, Errors } from '../utils/errors.js'
import { sendEmail, welcomeEmailHtml } from '../utils/email.js'
import { authenticate } from '../middleware/authenticate.js'

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().optional(),
  business_name: z.string().min(1).max(200),
  category: z.enum(['SALON', 'BARBER', 'MAKEUP', 'COMBO']).default('SALON'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)
}

async function generateTokens(fastify: FastifyInstance, userId: string, shopId: string | null, role: string, email: string) {
  const payload = { sub: userId, shop_id: shopId, role: role as import('../types/index.js').UserRole, email }
  const accessToken = fastify.jwt.sign(payload as any, { expiresIn: '1h' })
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [userId, tokenHash]
  )

  return { accessToken, refreshToken }
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/signup
  fastify.post('/signup', async (request, reply) => {
    const body = signupSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })
    }
    const { email, password, first_name, last_name, phone, business_name, category } = body.data

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return reply.status(409).send(Errors.CONFLICT('Email already registered'))
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const passwordHash = await bcrypt.hash(password, 10)
      const verifyToken = crypto.randomBytes(32).toString('hex')

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, email_verification_token)
         VALUES ($1, $2, $3, $4, $5, 'SHOP_OWNER', $6) RETURNING id`,
        [email, passwordHash, first_name, last_name, phone || null, verifyToken]
      )
      const userId = userResult.rows[0].id

      const shopResult = await client.query(
        `INSERT INTO shops (owner_id, business_name, slug, category, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, business_name, generateSlug(business_name), category, phone || null, email]
      )
      const shopId = shopResult.rows[0].id

      await client.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, userId])
      await client.query('COMMIT')

      const { accessToken, refreshToken } = await generateTokens(fastify, userId, shopId, 'SHOP_OWNER', email)

      await sendEmail({
        to: email,
        subject: 'Welcome to SalonHub — Your trial starts now!',
        html: welcomeEmailHtml(first_name, `${env.APP_URL}/dashboard`),
      })

      return reply.status(201).send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: { id: userId, email, first_name, last_name, role: 'SHOP_OWNER', shop_id: shopId },
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send({ error: 'Invalid credentials format', code: 'INVALID_INPUT', status: 422 })
    }
    const { email, password } = body.data

    const result = await pool.query(
      `SELECT u.*, s.subscription_status, s.trial_ends_at, s.business_name, s.subscription_plan_id,
              sp.name as plan_name, sp.price_per_month, sp.features as plan_features,
              sp.max_staff, sp.max_customers, sp.max_appointments_per_month
       FROM users u
       LEFT JOIN shops s ON s.id = u.shop_id
       LEFT JOIN subscription_plans sp ON sp.id = s.subscription_plan_id
       WHERE u.email = $1`,
      [email]
    )
    const user = result.rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid email or password', code: 'AUTH_FAILED', status: 401 })
    }

    if (user.status === 'SUSPENDED') {
      return reply.status(403).send({ error: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED', status: 403 })
    }

    const { accessToken, refreshToken } = await generateTokens(
      fastify, user.id, user.shop_id, user.role, user.email
    )

    return reply.send({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        shop_id: user.shop_id,
        business_name: user.business_name,
        subscription_status: user.subscription_status,
        trial_ends_at: user.trial_ends_at,
        subscription_plan_id: user.subscription_plan_id,
        plan_name: user.plan_name,
        plan_price: user.price_per_month,
        plan_features: user.plan_features,
        max_staff: user.max_staff,
        max_customers: user.max_customers,
        max_appointments_per_month: user.max_appointments_per_month,
      },
    })
  })

  // POST /api/auth/refresh-token
  fastify.post('/refresh-token', async (request, reply) => {
    const { refresh_token } = (request.body as { refresh_token?: string }) || {}
    if (!refresh_token) {
      return reply.status(400).send({ error: 'Refresh token required', code: 'INVALID_INPUT', status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex')
    const result = await pool.query(
      `SELECT rt.*, u.role, u.shop_id, u.email FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    )

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token', code: 'INVALID_TOKEN', status: 401 })
    }

    const { user_id, role, shop_id, email } = result.rows[0]
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])

    const { accessToken, refreshToken } = await generateTokens(fastify, user_id, shop_id, role, email)
    return reply.send({ access_token: accessToken, refresh_token: refreshToken })
  })

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const { refresh_token } = (request.body as { refresh_token?: string }) || {}
    if (refresh_token) {
      const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex')
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])
    }
    return reply.send({ message: 'Logged out successfully' })
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const { sub } = request.user
    const result = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.shop_id, u.status,
              s.business_name, s.subscription_status, s.trial_ends_at, s.category, s.logo_url
       FROM users u LEFT JOIN shops s ON s.id = u.shop_id WHERE u.id = $1`,
      [sub]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('User'))
    return reply.send(result.rows[0])
  })

  // POST /api/auth/forgot-password
  fastify.post('/forgot-password', async (request, reply) => {
    const { email } = (request.body as { email?: string }) || {}
    if (!email) return reply.status(422).send({ error: 'Email required', code: 'INVALID_INPUT', status: 422 })

    const result = await pool.query('SELECT id, first_name FROM users WHERE email = $1', [email])
    if (result.rows.length > 0) {
      const token = crypto.randomBytes(32).toString('hex')
      await pool.query(
        `UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '1 hour' WHERE id = $2`,
        [token, result.rows[0].id]
      )
      await sendEmail({
        to: email,
        subject: 'Reset your SalonHub password',
        html: `<p>Click <a href="${env.APP_URL}/auth/reset-password?token=${token}">here</a> to reset your password. Link expires in 1 hour.</p>`,
      })
    }
    return reply.send({ message: 'If that email exists, a reset link has been sent.' })
  })

  // POST /api/auth/reset-password
  fastify.post('/reset-password', async (request, reply) => {
    const { token, password } = (request.body as { token?: string; password?: string }) || {}
    if (!token || !password || password.length < 8) {
      return reply.status(422).send({ error: 'Valid token and password (min 8 chars) required', code: 'INVALID_INPUT', status: 422 })
    }

    const result = await pool.query(
      `SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    )
    if (result.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid or expired token', code: 'INVALID_TOKEN', status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2`,
      [hash, result.rows[0].id]
    )
    return reply.send({ message: 'Password reset successfully' })
  })
}
