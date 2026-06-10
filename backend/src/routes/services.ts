import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withRLS } from '../config/db.js'
import { authenticate } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'
import { paginate, paginateResult } from '../utils/pagination.js'

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.enum(['Hair', 'Makeup', 'Nails', 'Skin', 'Massage', 'Beard', 'Other']).default('Other'),
  base_price: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  image_url: z.string().url().optional().or(z.literal('')),
  display_order: z.coerce.number().int().default(0),
})

const packageSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  package_price: z.coerce.number().min(0),
  discount_percentage: z.coerce.number().min(0).max(100).default(0),
  duration_minutes: z.coerce.number().int().min(5).max(960),
  image_url: z.string().url().optional().or(z.literal('')),
  service_ids: z.array(z.string().uuid()).optional(),
})

export async function serviceRoutes(fastify: FastifyInstance) {
  const opts = { preHandler: authenticate }

  // ── SERVICES ────────────────────────────────────────────────────────────────

  fastify.get('/', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 50, category } = request.query as { page?: number; limit?: number; category?: string }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const rows = await withRLS({ shopId: shop_id, role }, async (client) => {
      const conditions = ['s.shop_id = $1']
      const params: unknown[] = [shop_id]
      if (category) { conditions.push(`s.category = $${params.length + 1}`); params.push(category) }

      const count = await client.query(
        `SELECT COUNT(*) FROM services s WHERE ${conditions.join(' AND ')}`, params
      )
      const data = await client.query(
        `SELECT * FROM services s WHERE ${conditions.join(' AND ')} ORDER BY s.display_order, s.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })

    return reply.send(paginateResult(rows.rows, rows.total, p, l))
  })

  fastify.post('/', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = serviceSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { name, description, category, base_price, duration_minutes, image_url, display_order } = body.data

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `INSERT INTO services (shop_id, name, description, category, base_price, duration_minutes, image_url, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [shop_id, name, description || null, category, base_price, duration_minutes, image_url || null, display_order]
      )
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = serviceSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const fields = Object.entries(body.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    if (fields.length === 0) return reply.status(422).send({ error: 'No fields to update', code: 'INVALID_INPUT', status: 422 })
    const values = Object.values(body.data).filter(v => v !== undefined)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE services SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 AND shop_id = $${fields.length + 2} RETURNING *`,
        [id, ...values, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Service'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE services SET is_active = false, updated_at = NOW() WHERE id = $1 AND shop_id = $2 RETURNING id`,
        [id, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Service'))
    return reply.send({ message: 'Service deactivated' })
  })

  // ── PACKAGES ─────────────────────────────────────────────────────────────────

  fastify.get('/packages', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const rows = await withRLS({ shopId: shop_id, role }, async (client) => {
      const count = await client.query(`SELECT COUNT(*) FROM service_packages WHERE shop_id = $1`, [shop_id])
      const data = await client.query(
        `SELECT sp.*,
                COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name, 'base_price', s.base_price, 'duration_minutes', s.duration_minutes))
                  FILTER (WHERE s.id IS NOT NULL), '[]') as services
         FROM service_packages sp
         LEFT JOIN package_services ps ON ps.package_id = sp.id
         LEFT JOIN services s ON s.id = ps.service_id
         WHERE sp.shop_id = $1
         GROUP BY sp.id ORDER BY sp.created_at DESC
         LIMIT $2 OFFSET $3`,
        [shop_id, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(rows.rows, rows.total, p, l))
  })

  fastify.post('/packages', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = packageSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { name, description, package_price, discount_percentage, duration_minutes, image_url, service_ids } = body.data

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const pkg = await client.query(
        `INSERT INTO service_packages (shop_id, name, description, package_price, discount_percentage, duration_minutes, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [shop_id, name, description || null, package_price, discount_percentage, duration_minutes, image_url || null]
      )
      if (service_ids?.length) {
        const vals = service_ids.map((sid, i) => `($1, $${i + 2})`).join(', ')
        await client.query(
          `INSERT INTO package_services (package_id, service_id) VALUES ${vals}`,
          [pkg.rows[0].id, ...service_ids]
        )
      }
      return pkg
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/packages/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = packageSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { service_ids, ...fields } = body.data
    const updateFields = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    const values = Object.entries(fields).filter(([, v]) => v !== undefined).map(([, v]) => v)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      let pkg
      if (updateFields.length > 0) {
        pkg = await client.query(
          `UPDATE service_packages SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $1 AND shop_id = $${updateFields.length + 2} RETURNING *`,
          [id, ...values, shop_id]
        )
      } else {
        pkg = await client.query('SELECT * FROM service_packages WHERE id = $1 AND shop_id = $2', [id, shop_id])
      }
      if (pkg.rows.length === 0) return null
      if (service_ids !== undefined) {
        await client.query('DELETE FROM package_services WHERE package_id = $1', [id])
        if (service_ids.length > 0) {
          const vals = service_ids.map((_, i) => `($1, $${i + 2})`).join(', ')
          await client.query(
            `INSERT INTO package_services (package_id, service_id) VALUES ${vals}`,
            [id, ...service_ids]
          )
        }
      }
      return pkg
    })
    if (!result) return reply.status(404).send(Errors.NOT_FOUND('Package'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/packages/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE service_packages SET is_active = false WHERE id = $1 AND shop_id = $2 RETURNING id`,
        [id, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Package'))
    return reply.send({ message: 'Package deactivated' })
  })
}
