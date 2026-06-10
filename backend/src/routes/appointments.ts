import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withRLS } from '../config/db.js'
import { authenticate } from '../middleware/authenticate.js'
import { Errors } from '../utils/errors.js'
import { paginate, paginateResult } from '../utils/pagination.js'

const appointmentSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  package_id: z.string().uuid().optional().nullable(),
  staff_id: z.string().uuid(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
})

async function calcEndTime(client: import('pg').PoolClient, startTime: string, serviceId?: string | null, packageId?: string | null): Promise<string> {
  let duration = 60
  if (serviceId) {
    const res = await client.query('SELECT duration_minutes FROM services WHERE id = $1', [serviceId])
    if (res.rows.length) duration = res.rows[0].duration_minutes
  } else if (packageId) {
    const res = await client.query('SELECT duration_minutes FROM service_packages WHERE id = $1', [packageId])
    if (res.rows.length) duration = res.rows[0].duration_minutes
  }
  const [h, m] = startTime.split(':').map(Number)
  const totalMin = h * 60 + m + duration
  return `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
}

export async function appointmentRoutes(fastify: FastifyInstance) {
  const opts = { preHandler: authenticate }

  fastify.get('/', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { page = 1, limit = 20, date, customer_id, staff_id, status } = request.query as {
      page?: number; limit?: number; date?: string; customer_id?: string; staff_id?: string; status?: string
    }
    const { offset, limit: l, page: p } = paginate(+page, +limit)

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const params: unknown[] = [shop_id]
      const conditions = ['a.shop_id = $1']

      if (date) { params.push(date); conditions.push(`a.appointment_date = $${params.length}`) }
      if (customer_id) { params.push(customer_id); conditions.push(`a.customer_id = $${params.length}`) }
      if (staff_id) { params.push(staff_id); conditions.push(`a.staff_id = $${params.length}`) }
      if (status) { params.push(status); conditions.push(`a.status = $${params.length}`) }

      const where = conditions.join(' AND ')
      const count = await client.query(`SELECT COUNT(*) FROM appointments a WHERE ${where}`, params)
      const data = await client.query(
        `SELECT a.*,
                c.first_name || ' ' || c.last_name as customer_name, c.phone as customer_phone,
                u.first_name || ' ' || u.last_name as staff_name,
                srv.name as service_name, srv.base_price,
                pkg.name as package_name
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN services srv ON srv.id = a.service_id
         LEFT JOIN service_packages pkg ON pkg.id = a.package_id
         WHERE ${where} ORDER BY a.appointment_date DESC, a.start_time DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, l, offset]
      )
      return { rows: data.rows, total: parseInt(count.rows[0].count) }
    })
    return reply.send(paginateResult(result.rows, result.total, p, l))
  })

  // GET /api/appointments/calendar/:date — day view
  fastify.get('/calendar/:date', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { date } = request.params as { date: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `SELECT a.*,
                c.first_name || ' ' || c.last_name as customer_name,
                u.first_name || ' ' || u.last_name as staff_name,
                srv.name as service_name, srv.base_price,
                pkg.name as package_name
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN services srv ON srv.id = a.service_id
         LEFT JOIN service_packages pkg ON pkg.id = a.package_id
         WHERE a.shop_id = $1 AND a.appointment_date = $2
         ORDER BY a.start_time`,
        [shop_id, date]
      )
    })
    return reply.send(result.rows)
  })

  fastify.get('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `SELECT a.*,
                c.first_name || ' ' || c.last_name as customer_name, c.phone as customer_phone,
                u.first_name || ' ' || u.last_name as staff_name,
                srv.name as service_name, srv.base_price,
                pkg.name as package_name
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN services srv ON srv.id = a.service_id
         LEFT JOIN service_packages pkg ON pkg.id = a.package_id
         WHERE a.id = $1 AND a.shop_id = $2`,
        [id, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Appointment'))
    return reply.send(result.rows[0])
  })

  fastify.post('/', opts, async (request, reply) => {
    const { shop_id, role, sub: staff_id } = request.user
    const body = appointmentSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const { customer_id, service_id, package_id, staff_id: reqStaffId, appointment_date, start_time, notes, status } = body.data
    const finalStaffId = reqStaffId || staff_id

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const end_time = await calcEndTime(client, start_time, service_id, package_id)
      return client.query(
        `INSERT INTO appointments (shop_id, customer_id, service_id, package_id, staff_id, appointment_date, start_time, end_time, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [shop_id, customer_id || null, service_id || null, package_id || null, finalStaffId,
         appointment_date, start_time, end_time, notes || null, status || 'PENDING']
      )
    })
    return reply.status(201).send(result.rows[0])
  })

  fastify.put('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }
    const body = appointmentSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(422).send({ error: body.error.errors[0].message, code: 'INVALID_INPUT', status: 422 })

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      const current = await client.query('SELECT * FROM appointments WHERE id = $1 AND shop_id = $2', [id, shop_id])
      if (current.rows.length === 0) return null

      const cur = current.rows[0]
      const newData = { ...cur, ...body.data }

      let end_time = cur.end_time
      if (body.data.start_time || body.data.service_id || body.data.package_id) {
        end_time = await calcEndTime(client, newData.start_time, newData.service_id, newData.package_id)
      }

      const updated = await client.query(
        `UPDATE appointments SET
           customer_id = $2, service_id = $3, package_id = $4, staff_id = $5,
           appointment_date = $6, start_time = $7, end_time = $8, status = $9, notes = $10, updated_at = NOW()
         WHERE id = $1 AND shop_id = $11 RETURNING *`,
        [id, newData.customer_id, newData.service_id, newData.package_id, newData.staff_id,
         newData.appointment_date, newData.start_time, end_time, newData.status, newData.notes, shop_id]
      )

      // Auto-create invoice + cash payment when appointment is marked COMPLETED
      if (body.data.status === 'COMPLETED' && cur.status !== 'COMPLETED') {
        const existing = await client.query('SELECT id FROM invoices WHERE appointment_id = $1', [id])
        if (existing.rows.length === 0 && (cur.service_id || cur.package_id)) {
          let price = 0, description = 'Service', service_id = null, package_id = null

          if (cur.service_id) {
            const svc = await client.query('SELECT name, base_price FROM services WHERE id = $1', [cur.service_id])
            if (svc.rows.length) { price = parseFloat(svc.rows[0].base_price); description = svc.rows[0].name; service_id = cur.service_id }
          } else if (cur.package_id) {
            const pkg = await client.query('SELECT name, package_price FROM service_packages WHERE id = $1', [cur.package_id])
            if (pkg.rows.length) { price = parseFloat(pkg.rows[0].package_price); description = pkg.rows[0].name; package_id = cur.package_id }
          }

          if (price > 0) {
            const cnt = await client.query('SELECT COUNT(*) as cnt FROM invoices WHERE shop_id = $1', [shop_id])
            const invoiceNumber = `INV-${String(parseInt(cnt.rows[0].cnt) + 1).padStart(4, '0')}`

            const inv = await client.query(
              `INSERT INTO invoices (shop_id, customer_id, invoice_number, total_amount, tax_amount, discount_amount, amount_paid, payment_status, appointment_id)
               VALUES ($1,$2,$3,$4,0,0,$4,'PAID',$5) RETURNING id`,
              [shop_id, cur.customer_id || null, invoiceNumber, price, id]
            )
            const invoiceId = inv.rows[0].id

            await client.query(
              `INSERT INTO invoice_items (invoice_id, description, service_id, package_id, quantity, unit_price, total_price)
               VALUES ($1,$2,$3,$4,1,$5,$5)`,
              [invoiceId, description, service_id, package_id, price]
            )

            await client.query(
              `INSERT INTO payments (invoice_id, shop_id, payment_method, amount_paid) VALUES ($1,$2,'CASH',$3)`,
              [invoiceId, shop_id, price]
            )

            if (cur.customer_id) {
              await client.query(
                `UPDATE customers SET total_spent = total_spent + $1, updated_at = NOW() WHERE id = $2`,
                [price, cur.customer_id]
              )
            }
          }
        }
      }

      return updated
    })
    if (!result) return reply.status(404).send(Errors.NOT_FOUND('Appointment'))
    return reply.send(result.rows[0])
  })

  fastify.delete('/:id', opts, async (request, reply) => {
    const { shop_id, role } = request.user
    const { id } = request.params as { id: string }

    const result = await withRLS({ shopId: shop_id, role }, async (client) => {
      return client.query(
        `UPDATE appointments SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND shop_id = $2 RETURNING id`,
        [id, shop_id]
      )
    })
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Appointment'))
    return reply.send({ message: 'Appointment cancelled' })
  })
}
