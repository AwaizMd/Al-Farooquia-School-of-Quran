import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { badRequest } from '../common/errors.js'

/**
 * A real calendar date as YYYY-MM-DD. JavaScript would quietly turn 2026-02-30
 * into 2 March, and PostgreSQL rejects 2026-13-45, so check the round trip.
 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '1900-01-01'
  }, 'Not a valid date.')

const hasNul = (v: unknown): boolean =>
  typeof v === 'string' ? v.includes('\u0000') : Array.isArray(v) ? v.some(hasNul) : v !== null && typeof v === 'object' ? Object.entries(v).some(([k, x]) => k.includes('\u0000') || hasNul(x)) : false

/** PostgreSQL text cannot hold NUL characters; refuse them up front instead of failing in the database. */
export const rejectNulBytes: RequestHandler = (req, _res, next) => {
  if (/%00/i.test(req.originalUrl) || hasNul(req.body) || hasNul(req.query)) return next(badRequest('The request contains invalid characters.'))
  next()
}

// Parse request input with a Zod schema. Unknown keys are stripped by default,
// which also blocks mass-assignment of fields the client should not control.
export const body = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.body ?? {})
export const query = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.query)
export const params = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.params)
