export type UserRole = 'SUPER_ADMIN' | 'SHOP_OWNER' | 'SHOP_STAFF' | 'CUSTOMER'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED'
export type ShopCategory = 'SALON' | 'BARBER' | 'MAKEUP' | 'COMBO'
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
export type PaymentMethod = 'CASH' | 'CARD' | 'MPESA' | 'BANK_TRANSFER' | 'CREDIT'
export type DebtStatus = 'ACTIVE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE'
export type BillingStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

export interface JWTPayload {
  sub: string
  shop_id: string | null
  role: UserRole
  email: string
  iat?: number
  exp?: number
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export interface PaginationQuery {
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pages: number
  limit: number
}
