import { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requireAuth } from '../../middleware/auth.js'
import { body } from '../../middleware/validate.js'
import { LIMITS, consume } from '../../common/rateLimit.js'
import { audit } from './audit.service.js'

export const auditRouter = Router()

// Things that happen in the browser but should still be on record (data leaving
// the system as an export, or a report being produced). Only these actions are accepted.
const ClientEvent = z.object({
  action: z.enum(['export.csv', 'report.previewed', 'report.printed']),
  entity: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).optional(),
})

doc('post', '/audit/events', 'Administration', 'Record an export or report generated in the browser', { body: ClientEvent })
auditRouter.post('/audit/events', requireAuth, async (req, res) => {
  await consume({ ...LIMITS.reauthPerUser, name: 'audit:client', max: 60 }, req.auth!.user.id)
  const e = body(req, ClientEvent)
  await audit({ action: e.action, summary: `${e.entity}${e.description ? ` · ${e.description}` : ''}`, entityType: 'client_event' }, req)
  res.status(204).end()
})
