import pg from 'pg'
import { env } from './env.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err)
})

export interface RLSContext {
  shopId?: string | null
  role: string
}

export async function withRLS<T>(
  ctx: RLSContext,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL app.role = '${ctx.role}'`)
    if (ctx.shopId) {
      await client.query(`SET LOCAL app.current_shop_id = '${ctx.shopId}'`)
    } else {
      await client.query(`SET LOCAL app.current_shop_id = ''`)
    }
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params)
}
