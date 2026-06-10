import Redis from 'ioredis'
import { env } from './env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: false,
})

redis.on('error', (err) => console.error('Redis error:', err))
redis.on('connect', () => console.log('Redis connected'))
