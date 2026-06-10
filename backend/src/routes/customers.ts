import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withRLS } from '../config/db.js'
import { authenticate } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'
import { paginate, paginateResult } from '../utils/pagination.js'

const customerSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['M', 'F', 'OTHER']).optional(),
  date_of_birth: z.string().optional(),
  notes: z.string().optional(),
})

function generateCustomerCode(name: string): string {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-4)}`
}

export async function customerRoutes(fastify: FastifyInstance) {
  const opts = { preHandler: authenticate }

  fastify.get('/', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20, search } = request.query as {
      page?: number; limit?: number; search?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      let where = 'WHERE c.shop_id = $1'
      if (search) {
        params.push(`%${search}%`)
        const n = params.length
        where += ` AND (c.first_name ILIKE $${n} OR c.last_name ILIKE $${n} OR c.phone ILIKE $${n} OR c.email ILIKE $${n})`
      }
      const count = await client.query(`SELECT COUNT(*) FROM customers c ${where}`, params)
      const data = await client.query(
        `SELECT c.*,
                (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id) as appointment_count,
                (SELECT COUNT(*) FROM customer_debts d WHERE d.customer_id = c.id AND d.status IN ('ACTIVE','PARTIALLY_PAID')) as active_debts
         FROM customers c ${where} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(result.rows, result.total, p, l))
  })

  fastify.get('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const customer = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND shop_id = $2', [id, shop_id]
      )
      if (customer.rows.length === 0) return null

      const appointments = await client.query(
        `SELECT a.*, srv.name as service_name FROM appointments a
         LEFT JOIN services srv ON srv.id = a.service_id
         WHERE a.customer_id = $1 ORDER BY a.appointment_date DESC LIMIT 20`,
        [id]
      )
      const invoices = await client.query(
        `SELECT * FROM invoices WHERE customer_id = $1 ORDER BY invoice_date DESC LIMIT 20`, [id]
      )
      const debts = await client.query(
        `SELECT * FROM customer_debts WHERE customer_id = $1 AND status IN ('ACTIVE','PARTIALLY_PAID') ORDER BY created_at DESC`,
        [id]
      )
      return { ...customer.rows[0], appointments: appointments.rows, invoices: invoices.rows, debts: debts.rows }
    })
    if (!result) return reply.status(404).send(Errors.NOT_FOUND('Customer'))
    return reply.send(result)
  })

  fastify.post('/', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const body = customerSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { first_name, last_name, phone, email, gender, date_of_birth, notes } = body.data
    const customerCode = generateCustomerCode(first_name)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `INSERT INTO customers (shop_id, first_name, last_name, phone, email, gender, date_of_birth, customer_code, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [shop_id, first_name, last_name, phone || null, email || null, gender || null, date_of_birth || null, customerCode, notes || null]
      )
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = customerSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const fields = Object.entries(body.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, _], i) => `${k} = $${i + 2}`)
    const values = Object.values(body.data).filter(v => v !== undefined)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 AND shop_id = $${fields.length + 2} RETURNING *`,
        [id, ...values, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Customer'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        'DELETE FROM customers WHERE id = $1 AND shop_id = $2 RETURNING id', [id, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Customer'))
    return reply.send({ message: 'Customer deleted' })
  })
}
