// Errors that are safe to show to API clients. Anything else becomes a generic
// 500 so internal details (SQL, stack traces, file paths) never leak.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details)
export const validationFailed = (details: unknown) => new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', details)
export const unauthenticated = (message = 'Please sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message = 'You do not have permission to do this.') => new AppError(403, 'FORBIDDEN', message)
// Used for records outside the caller's scope too, so their existence is not revealed.
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (code: string, message: string) => new AppError(409, code, message)
export const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', { retryAfterSeconds })
