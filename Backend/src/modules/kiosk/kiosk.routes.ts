import { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { IsoDate, body, query } from '../../middleware/validate.js'
import { clearKioskCookie, kioskRequestChecks, register, requireKiosk, reset, scan, status } from './device.service.js'
import * as kiosks from './kiosk.service.js'

const T = 'Attendance kiosks'
const Id = z.string().uuid()
const Page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }

// ---------- The kiosk device: its own credential, no user session ----------

export const kioskDeviceRouter = Router()
kioskDeviceRouter.use(kioskRequestChecks)

const Register = z.object({ code: z.string().trim().min(8).max(20) })
doc('post', '/kiosk/device/register', T, 'Register this device with a one-time code', { body: Register, auth: 'one-time registration code' })
kioskDeviceRouter.post('/register', async (req, res) => {
  res.status(201).json(await register(req, res, body(req, Register).code))
})

doc('get', '/kiosk/device/status', T, 'This kiosk’s configuration (also its heartbeat)', { auth: 'kiosk credential' })
kioskDeviceRouter.get('/status', requireKiosk, async (req, res) => {
  res.json(await status(req, res))
})

const Scan = z.object({ token: z.string().min(1).max(400), requestId: z.string().uuid(), action: z.enum(['CHECK_IN', 'CHECK_OUT']).optional(), pin: z.string().regex(/^\d{4,6}$/).optional() })
doc('post', '/kiosk/device/scan', T, 'Submit a scanned QR code. Every check happens on the server.', { body: Scan, auth: 'kiosk credential' })
kioskDeviceRouter.post('/scan', requireKiosk, async (req, res) => {
  res.json(await scan(req, body(req, Scan)))
})

doc('post', '/kiosk/device/reset', T, 'Sign this kiosk out; it needs a new registration code', { auth: 'kiosk credential' })
kioskDeviceRouter.post('/reset', requireKiosk, async (req, res) => {
  await reset(req, res)
  res.status(204).end()
})

/** Lets a kiosk whose credential is no longer valid forget it locally. */
kioskDeviceRouter.post('/forget', (_req, res) => {
  clearKioskCookie(res)
  res.status(204).end()
})

// ---------- Administration ----------

export const kioskAdminRouter = Router()

const LayerSchema = z.record(z.string(), z.unknown())
const IpList = z.array(z.string().trim().regex(/^[0-9a-fA-F.:]{2,45}$/, 'Enter an address such as 203.0.113.7, or a range such as 203.0.113.')).max(20)
const CreateKiosk = z.object({ name: z.string().trim().min(2).max(80), branch: z.string().trim().max(80).nullable().optional(), location: z.string().trim().max(120).nullable().optional(), allowedIps: IpList.optional(), settings: LayerSchema.optional() })
const Filter = z.object({ from: IsoDate.optional(), to: IsoDate.optional(), branch: z.string().max(80).optional(), kioskId: Id.optional() }).refine((x) => !x.from || !x.to || x.from <= x.to, { path: ['to'], message: 'The end date must not be before the start date.' })
const ScanFilter = z.object({ from: IsoDate.optional(), to: IsoDate.optional(), outcome: z.string().max(40).optional(), ...Page }).refine((x) => !x.from || !x.to || x.from <= x.to, { path: ['to'], message: 'The end date must not be before the start date.' })

doc('get', '/kiosks', T, 'Kiosks and their activity, with totals', { query: Filter, auth: 'kiosks.manage' })
kioskAdminRouter.get('/kiosks', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.dashboard(query(req, Filter)))
})

doc('post', '/kiosks', T, 'Create a kiosk and its one-time registration code', { body: CreateKiosk, auth: 'kiosks.manage + recent re-authentication' })
kioskAdminRouter.post('/kiosks', requirePermission('kiosks.manage'), requireRecentAuth(), async (req, res) => {
  res.status(201).json(await kiosks.createKiosk(req, body(req, CreateKiosk)))
})

doc('patch', '/kiosks/:id', T, 'Rename, reassign or reconfigure a kiosk', { body: CreateKiosk.partial(), auth: 'kiosks.manage' })
kioskAdminRouter.patch('/kiosks/:id', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.updateKiosk(req, Id.parse(req.params.id), body(req, CreateKiosk.partial())))
})

doc('post', '/kiosks/:id/registration-code', T, 'New code for a new or reset device; signs out the current one', { auth: 'kiosks.manage + recent re-authentication' })
kioskAdminRouter.post('/kiosks/:id/registration-code', requirePermission('kiosks.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await kiosks.newCode(req, Id.parse(req.params.id)))
})

doc('post', '/kiosks/:id/deactivate', T, 'Stop a kiosk at once', { auth: 'kiosks.manage' })
kioskAdminRouter.post('/kiosks/:id/deactivate', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.setActive(req, Id.parse(req.params.id), false))
})

doc('post', '/kiosks/:id/activate', T, 'Switch a deactivated kiosk back on', { auth: 'kiosks.manage + recent re-authentication' })
kioskAdminRouter.post('/kiosks/:id/activate', requirePermission('kiosks.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await kiosks.setActive(req, Id.parse(req.params.id), true))
})

doc('post', '/kiosks/:id/revoke', T, 'Destroy a kiosk’s credential', { auth: 'kiosks.manage' })
kioskAdminRouter.post('/kiosks/:id/revoke', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.revoke(req, Id.parse(req.params.id)))
})

doc('get', '/kiosks/:id/scans', T, 'Everything one kiosk submitted', { query: ScanFilter, auth: 'kiosks.manage' })
kioskAdminRouter.get('/kiosks/:id/scans', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.scansOf(Id.parse(req.params.id), query(req, ScanFilter)))
})

doc('get', '/kiosk-settings', T, 'Kiosk settings: organization defaults, this madrasa’s overrides, and the result', { auth: 'kiosks.manage' })
kioskAdminRouter.get('/kiosk-settings', requirePermission('kiosks.manage'), async (_req, res) => {
  res.json(await kiosks.settingsView())
})

doc('put', '/kiosk-settings', T, 'Replace this madrasa’s overrides', { body: LayerSchema, auth: 'kiosks.manage' })
kioskAdminRouter.put('/kiosk-settings', requirePermission('kiosks.manage'), async (req, res) => {
  res.json(await kiosks.setMadrasaSettings(req, body(req, LayerSchema)))
})

doc('put', '/kiosk-settings/organization', T, 'Replace the organization’s defaults', { body: LayerSchema, auth: 'org.manage' })
kioskAdminRouter.put('/kiosk-settings/organization', requirePermission('org.manage'), async (req, res) => {
  res.json(await kiosks.setOrganizationDefaults(req, body(req, LayerSchema)))
})
