import type { PaginatedResult } from '../types/index.js'

export function paginate(page = 1, limit = 20) {
  const p = Math.max(1, page)
  const l = Math.min(100, Math.max(1, limit))
  return { offset: (p - 1) * l, limit: l, page: p }
}

export function paginateResult<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  }
}
