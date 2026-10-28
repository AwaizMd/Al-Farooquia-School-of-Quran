import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { Router } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import { logger } from './common/logger.js'
import { buildOpenApiDocument } from './docs/openapi.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { csrfProtection, loadSession } from './middleware/auth.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { adminRouter } from './modules/users/users.routes.js'
import { peopleRouter } from './modules/students/students.routes.js'
import { learningRouter } from './modules/learning/learning.routes.js'
import { assessmentsRouter } from './modules/assessments/assessments.routes.js'
import { feesRouter, webhookRouter } from './modules/fees/fees.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { campusRouter } from './modules/hostel/campus.routes.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY)

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Accept a well-formed upstream id, otherwise mint one.
        const incoming = req.headers['x-request-id']
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
        res.setHeader('X-Request-Id', id)
        return id
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
    }),
  )
  app.use(helmet())
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      maxAge: 600,
    }),
  )
  // Gateway callbacks need the raw body for signature checks, and carry no session.
  app.use('/api/v1', webhookRouter)
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  const api = Router()
  api.use((_req, res, next) => {
    // API responses are private to the signed-in user; never cache them.
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  api.use('/health', healthRouter)
  api.use(loadSession, csrfProtection)
  api.use('/auth', authRouter)
  api.use('/admin', adminRouter)
  api.use(peopleRouter)
  api.use(learningRouter)
  api.use(assessmentsRouter)
  api.use(feesRouter)
  api.use(notificationsRouter)
  api.use(campusRouter)
  app.use('/api/v1', api)

  if (env.API_DOCS_ENABLED) {
    app.get('/api/docs/openapi.json', (_req, res) => {
      res.json(buildOpenApiDocument())
    })
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/docs/openapi.json' } }))
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
