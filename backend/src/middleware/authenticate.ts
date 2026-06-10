import type { FastifyRequest, FastifyReply } from 'fastify'
import { Errors } from '../utils/errors.js'
import type { UserRole } from '../types/index.js'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send(Errors.UNAUTHORIZED())
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send(Errors.UNAUTHORIZED())
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send(Errors.FORBIDDEN())
    }
  }
}

export function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('SUPER_ADMIN')(request, reply)
}
