import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { AppError, notFound, validationFailed } from '../common/errors.js'
import { logger } from '../common/logger.js'

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound('This endpoint does not exist.'))

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError
  if (err instanceof AppError) appErr = err
  else if (err instanceof ZodError) appErr = validationFailed(err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  else if (err?.type === 'entity.too.large') appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.')
  else if (err?.type === 'entity.parse.failed') appErr = new AppError(400, 'BAD_JSON', 'The request body is not valid JSON.')
  else {
    (req.log ?? logger).error({ err }, 'Unhandled error')
    appErr = new AppError(500, 'INTERNAL', 'Something went wrong. Please try again.')
  }
  if (appErr.status === 429 && typeof appErr.details === 'object' && appErr.details && 'retryAfterSeconds' in appErr.details) {
    res.setHeader('Retry-After', String(appErr.details.retryAfterSeconds))
  }
  const body: ErrorBody = { error: { code: appErr.code, message: appErr.message, requestId: req.id as string | undefined } }
  if (appErr.details !== undefined) body.error.details = appErr.details
  res.status(appErr.status).json(body)
}
