import type { FastifyInstance } from 'fastify'
import { pool } from '../config/db.js'
import { Errors } from '../utils/errors.js'

export async function publicRoutes(fastify: FastifyInstance) {
  // GET /api/public/subscription-plans
  fastify.get('/subscription-plans', async (_request, reply) => {
    const result = await pool.query(
      `SELECT id, name, description, price_per_month, max_staff, max_customers,
              max_appointments_per_month, features
       FROM subscription_plans WHERE is_active = true ORDER BY price_per_month ASC`
    )
    return reply.send(result.rows)
  })

  // GET /api/public/shop/:slug
  fastify.get('/shop/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const result = await pool.query(
      `SELECT s.business_name, s.slug, s.category, s.description, s.logo_url, s.banner_url,
              s.city, s.country, s.opening_time, s.closing_time,
              srv.id as service_id, srv.name as service_name, srv.base_price, srv.duration_minutes, srv.category as service_category
       FROM shops s
       LEFT JOIN services srv ON srv.shop_id = s.id AND srv.is_active = true
       WHERE s.slug = $1 AND s.subscription_status IN ('ACTIVE', 'TRIAL')`,
      [slug]
    )
    if (result.rows.length === 0) return reply.status(404).send(Errors.NOT_FOUND('Shop'))

    const shop = {
      business_name: result.rows[0].business_name,
      slug: result.rows[0].slug,
      category: result.rows[0].category,
      description: result.rows[0].description,
      logo_url: result.rows[0].logo_url,
      banner_url: result.rows[0].banner_url,
      city: result.rows[0].city,
      country: result.rows[0].country,
      opening_time: result.rows[0].opening_time,
      closing_time: result.rows[0].closing_time,
      services: result.rows
        .filter(r => r.service_id)
        .map(r => ({
          id: r.service_id,
          name: r.service_name,
          base_price: r.base_price,
          duration_minutes: r.duration_minutes,
          category: r.service_category,
        })),
    }
    return reply.send(shop)
  })
}
