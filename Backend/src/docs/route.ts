import type { z } from 'zod'
import { registry } from './openapi.js'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

// Compact OpenAPI registration so each route documents itself next to its handler.
export function doc(method: Method, path: string, tag: string, summary: string, opts: { body?: z.ZodType; query?: z.ZodObject; auth?: string } = {}) {
  registry.registerPath({
    method,
    path: path.replace(/:(\w+)/g, '{$1}'),
    tags: [tag],
    summary,
    ...(opts.auth ? { description: `Requires: ${opts.auth}` } : {}),
    request: {
      ...(opts.body ? { body: { content: { 'application/json': { schema: opts.body } } } } : {}),
      ...(opts.query ? { query: opts.query } : {}),
    },
    responses: { 200: { description: 'OK' }, 400: { description: 'Invalid request' }, 401: { description: 'Not signed in' }, 403: { description: 'Not permitted' }, 429: { description: 'Rate limited' } },
  })
}
