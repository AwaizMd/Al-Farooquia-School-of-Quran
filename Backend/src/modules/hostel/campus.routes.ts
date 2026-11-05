import { Router } from 'express'
import { z } from 'zod'
import { HostelRollStatus } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requirePermission } from '../../middleware/auth.js'
import { body, query, IsoDate } from '../../middleware/validate.js'
import * as hostel from './hostel.service.js'

export const campusRouter = Router()
const Id = z.string().uuid()
const Iso = IsoDate
const H = 'Hostel'

doc('get', '/hostel', H, 'Rooms, beds, occupants and residents without a bed', { auth: 'hostel.read' })
campusRouter.get('/hostel', requirePermission('hostel.read'), async (_req, res) => res.json(await hostel.overview()))

doc('post', '/hostel/beds/:id/assign', H, 'Assign or transfer a resident to a bed', { body: z.object({ studentId: Id }), auth: 'hostel.manage' })
campusRouter.post('/hostel/beds/:id/assign', requirePermission('hostel.manage'), async (req, res) => {
  res.json(await hostel.assignBed(req, Id.parse(req.params.id), body(req, z.object({ studentId: Id })).studentId))
})

doc('post', '/hostel/beds/:id/release', H, 'Release a bed', { body: z.object({ reason: z.string().trim().min(3).max(200) }), auth: 'hostel.manage' })
campusRouter.post('/hostel/beds/:id/release', requirePermission('hostel.manage'), async (req, res) => {
  res.json(await hostel.releaseBed(req, Id.parse(req.params.id), body(req, z.object({ reason: z.string().trim().min(3).max(200) })).reason))
})

doc('get', '/hostel/history', H, 'Bed assignment history', { auth: 'hostel.read' })
campusRouter.get('/hostel/history', requirePermission('hostel.read'), async (req, res) => res.json(await hostel.history(query(req, z.object({ studentId: Id.optional() })).studentId)))

const Roll = z.object({ date: Iso, entries: z.array(z.object({ studentId: Id, status: z.enum(HostelRollStatus), note: z.string().trim().max(200).optional() })).min(1).max(300), reason: z.string().trim().min(3).max(200).optional() })
doc('post', '/hostel/roll-call', H, 'Save the night roll call', { body: Roll, auth: 'hostel.manage' })
campusRouter.post('/hostel/roll-call', requirePermission('hostel.manage'), async (req, res) => res.json(await hostel.saveRollCall(req, body(req, Roll))))

doc('get', '/hostel/roll-call', H, 'Roll calls in a date range', { auth: 'hostel.read' })
campusRouter.get('/hostel/roll-call', requirePermission('hostel.read'), async (req, res) => res.json(await hostel.rollCalls(query(req, z.object({ from: Iso.optional(), to: Iso.optional() })))))
