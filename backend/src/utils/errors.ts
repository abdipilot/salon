export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public status: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  UNAUTHORIZED: () => new AppError('Authentication required', 'UNAUTHORIZED', 401),
  FORBIDDEN: () => new AppError('Access denied', 'FORBIDDEN', 403),
  NOT_FOUND: (entity = 'Resource') => new AppError(`${entity} not found`, 'NOT_FOUND', 404),
  CONFLICT: (msg: string) => new AppError(msg, 'CONFLICT', 409),
  VALIDATION: (msg: string) => new AppError(msg, 'INVALID_INPUT', 422),
  INTERNAL: () => new AppError('Internal server error', 'INTERNAL_ERROR', 500),
  SHOP_SUSPENDED: () => new AppError('Shop is suspended. Please contact support.', 'SHOP_SUSPENDED', 403),
  TRIAL_EXPIRED: () => new AppError('Your trial has expired. Please upgrade to continue.', 'TRIAL_EXPIRED', 403),
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return { error: err.message, code: err.code, status: err.status }
  }
  const e = err as Error
  console.error('Unhandled error:', e)
  return { error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 }
}
