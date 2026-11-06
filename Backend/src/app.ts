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
import { requireFeature, resolveMadrasa } from './tenancy/access.js'
import { rejectNulBytes } from './middleware/validate.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { adminRouter } from './modules/users/users.routes.js'
import { peopleRouter } from './modules/students/students.routes.js'
import { learningRouter } from './modules/learning/learning.routes.js'
import { assessmentsRouter } from './modules/assessments/assessments.routes.js'
import { feesRouter } from './modules/fees/fees.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { campusRouter } from './modules/hostel/campus.routes.js'
import { auditRouter } from './modules/audit-logs/audit.routes.js'
import { paymentSettingsRouter } from './modules/payment-settings/settings.routes.js'
import { manualPaymentsRouter } from './modules/fees/manual.routes.js'
import { orgRouter } from './modules/organization/org.routes.js'
import { kioskAdminRouter, kioskDeviceRouter } from './modules/kiosk/kiosk.routes.js'
import { staffAttendanceRouter } from './modules/staff-attendance/attendance.routes.js'

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
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'X-Madrasa-Id', 'X-File-Name'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  const api = Router()
  api.use((_req, res, next) => {
    // API responses are private to the signed-in user; never cache them.
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  api.use('/health', healthRouter)
  api.use(rejectNulBytes)
  // Kiosks authenticate as devices, not people, so they come before the session middleware.
  api.use('/kiosk/device', kioskDeviceRouter)
  // Fully signed-in requests then run inside their active madrasa (src/tenancy).
  api.use(loadSession, csrfProtection, resolveMadrasa)
  // Modules a madrasa can switch off are refused by the API, not only hidden in the menu.
  api.use(['/fees', '/payments', '/admin/payment-settings', '/reminders'], requireFeature('FEES'))
  api.use(['/exams', '/exam-results', '/grading', '/report-cards'], requireFeature('ASSESSMENTS'))
  api.use('/scheduled-reports', requireFeature('SCHEDULED_REPORTS'))
  api.use('/hostel', requireFeature('HOSTEL'))
  api.use(['/kiosks', '/kiosk-settings', '/staff-shifts', '/staff-attendance'], requireFeature('STAFF_ATTENDANCE'))
  api.use('/auth', authRouter)
  api.use('/admin', adminRouter)
  api.use(peopleRouter)
  api.use(learningRouter)
  api.use(assessmentsRouter)
  api.use(feesRouter)
  api.use(paymentSettingsRouter)
  api.use(manualPaymentsRouter)
  api.use(notificationsRouter)
  api.use(campusRouter)
  api.use(auditRouter)
  api.use(orgRouter)
  api.use(kioskAdminRouter)
  api.use(staffAttendanceRouter)
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
