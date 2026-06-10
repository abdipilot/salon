import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import bcrypt from 'bcryptjs'
import { env } from './config/env.js'
import { pool } from './config/db.js'
import { redis } from './config/redis.js'
import { ensureBucket } from './config/minio.js'
import { authRoutes } from './routes/auth.js'
import { publicRoutes } from './routes/public.js'
import { serviceRoutes } from './routes/services.js'
import { customerRoutes } from './routes/customers.js'
import { appointmentRoutes } from './routes/appointments.js'
import { accountingRoutes } from './routes/accounting.js'
import { adminRoutes } from './routes/admin.js'
import { settingsRoutes } from './routes/settings.js'
import { AppError } from './utils/errors.js'

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
})

async function bootstrap() {
  // ── PLUGINS ──────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: [env.APP_URL, 'http://localhost:5173', 'http://localhost:5000'],
    credentials: true,
  })

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  })

  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  })

  // ── ERROR HANDLER ─────────────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send({ error: error.message, code: error.code, status: error.status })
    }
    if (error.validation) {
      return reply.status(422).send({ error: error.message, code: 'INVALID_INPUT', status: 422 })
    }
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  })

  // ── ROUTES ───────────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(publicRoutes, { prefix: '/api/public' })
  await fastify.register(serviceRoutes, { prefix: '/api/services' })
  await fastify.register(customerRoutes, { prefix: '/api/customers' })
  await fastify.register(appointmentRoutes, { prefix: '/api/appointments' })
  await fastify.register(accountingRoutes, { prefix: '/api' })
  await fastify.register(adminRoutes, { prefix: '/api/admin' })
  await fastify.register(settingsRoutes, { prefix: '/api/settings' })

  // ── SEED SUPER ADMIN ────────────────────────────────────────────────────
  await seedSuperAdmin()

  // ── START ────────────────────────────────────────────────────────────────
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
  fastify.log.info(`SalonHub API running on port ${env.PORT}`)

  // MinIO setup (non-blocking)
  ensureBucket().catch(err => fastify.log.warn('MinIO not available:', err.message))
}

async function seedSuperAdmin() {
  try {
    const existing = await pool.query(
      `SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`
    )
    if (existing.rows.length > 0) return

    const hash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10)
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
       VALUES ($1, $2, 'Super', 'Admin', 'SUPER_ADMIN', true)
       ON CONFLICT (email) DO NOTHING`,
      [env.SUPER_ADMIN_EMAIL, hash]
    )
    fastify.log.info(`Super admin created: ${env.SUPER_ADMIN_EMAIL}`)
  } catch (err) {
    fastify.log.error({ err }, 'Failed to seed super admin')
  }
}

async function gracefulShutdown() {
  fastify.log.info('Shutting down...')
  await fastify.close()
  await pool.end()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
