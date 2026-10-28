import type { Request } from 'express'
import type { z } from 'zod'

// Parse request input with a Zod schema. Unknown keys are stripped by default,
// which also blocks mass-assignment of fields the client should not control.
export const body = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.body ?? {})
export const query = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.query)
export const params = <T extends z.ZodType>(req: Request, schema: T): z.infer<T> => schema.parse(req.params)
