import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

// Modules register their paths here; the document is built on request so it
// always reflects every route that has been imported.
export const registry = new OpenAPIRegistry()

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Al Farooquia MMS API', version: '1.0.0', description: 'Madarsa Management System. All endpoints are under /api/v1.' },
    servers: [{ url: '/api/v1' }],
  })
}
