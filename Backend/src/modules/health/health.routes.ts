import { Router } from 'express'
import { prisma } from '../../database/prisma.js'
import { registry } from '../../docs/openapi.js'
import { z } from 'zod'

// Health responses deliberately carry no versions, hostnames or configuration.
export const healthRouter = Router()

const HealthResponse = z.object({ status: z.enum(['ok', 'unavailable']) })
registry.registerPath({ method: 'get', path: '/health/live', tags: ['Health'], summary: 'Process is running', responses: { 200: { description: 'Alive', content: { 'application/json': { schema: HealthResponse } } } } })
registry.registerPath({ method: 'get', path: '/health/ready', tags: ['Health'], summary: 'Ready to serve traffic (database reachable)', responses: { 200: { description: 'Ready', content: { 'application/json': { schema: HealthResponse } } }, 503: { description: 'Not ready', content: { 'application/json': { schema: HealthResponse } } } } })

healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok' })
})

healthRouter.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok' })
  } catch (err) {
    req.log.warn({ err }, 'Readiness check failed: database unreachable')
    res.status(503).json({ status: 'unavailable' })
  }
})
