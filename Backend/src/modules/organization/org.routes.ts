import { Router } from 'express'
import { z } from 'zod'
import { Feature } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { body } from '../../middleware/validate.js'
import { activeMadrasaId } from '../../tenancy/context.js'
import { madrasaProfile } from '../../tenancy/settings.js'
import { permissionMatrix } from '../auth/permissions.js'
import * as org from './org.service.js'

export const orgRouter = Router()
const T = 'Organization & madrasas'
const Id = z.string().uuid()

const CURRENCIES = ['INR', 'PKR', 'BDT', 'GBP', 'USD', 'AED'] as const
const Timezone = z.string().trim().max(64).refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'Unknown timezone.')

const Settings = z.object({
  brandName: z.string().trim().min(3).max(120), shortName: z.string().trim().min(2).max(60), brandArabic: z.string().trim().max(120), tagline: z.string().trim().max(120),
  address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().email(), currency: z.enum(CURRENCIES), timezone: Timezone,
  weeklyOff: z.number().int().min(0).max(6), feeDueDay: z.number().int().min(1).max(28),
}).partial()

doc('get', '/settings', 'Administration', 'The active madrasa’s details and rules, on top of the organization’s')
orgRouter.get('/settings', requireAuth, async (_req, res) => {
  res.json(await org.settingsView())
})

doc('put', '/settings', 'Administration', 'Change the active madrasa’s details and rules', { body: Settings, auth: 'settings.manage' })
orgRouter.put('/settings', requirePermission('settings.manage'), async (req, res) => {
  res.json(await org.updateSettings(req, body(req, Settings)))
})

// ---------- The active madrasa ----------

doc('get', '/madrasa', T, 'The active madrasa: configuration and which modules are on')
orgRouter.get('/madrasa', requireAuth, async (_req, res) => {
  const p = await madrasaProfile(activeMadrasaId())
  res.json(p)
})

const ConfigPatch = z.record(z.string(), z.unknown())
doc('put', '/madrasa/config', T, 'Change the active madrasa’s configuration (partial; validated as a whole)', { body: ConfigPatch, auth: 'settings.manage' })
orgRouter.put('/madrasa/config', requirePermission('settings.manage'), async (req, res) => {
  res.json(await org.updateConfig(req, body(req, ConfigPatch)))
})

// ---------- Organization (Super Admin) ----------

doc('get', '/org/permissions', T, 'The role → permission matrix', { auth: 'org.manage' })
orgRouter.get('/org/permissions', requirePermission('org.manage'), (_req, res) => {
  res.json(permissionMatrix())
})

const OrgPatch = z.object({ name: z.string().trim().min(3).max(120), shortName: z.string().trim().min(2).max(60), nameArabic: z.string().trim().max(120), tagline: z.string().trim().max(120), address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().email() }).partial()
doc('get', '/org', T, 'The organization', { auth: 'org.manage' })
orgRouter.get('/org', requirePermission('org.manage'), async (_req, res) => {
  res.json(await org.organization())
})
doc('put', '/org', T, 'Change the organization’s details', { body: OrgPatch, auth: 'org.manage' })
orgRouter.put('/org', requirePermission('org.manage'), async (req, res) => {
  res.json(await org.updateOrganization(req, body(req, OrgPatch)))
})

doc('get', '/org/madrasas', T, 'Every madrasa of the organization', { auth: 'org.manage' })
orgRouter.get('/org/madrasas', requirePermission('org.manage'), async (_req, res) => {
  res.json(await org.listMadrasas())
})

const NewMadrasa = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,12}$/, 'Use 2–12 letters, numbers or dashes.'), name: z.string().trim().min(3).max(120), shortName: z.string().trim().min(2).max(60),
  nameArabic: z.string().trim().max(120).optional(), address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().email(),
  currency: z.enum(CURRENCIES).default('INR'), timezone: Timezone.default('Asia/Kolkata'), weeklyOff: z.number().int().min(0).max(6).default(5), feeDueDay: z.number().int().min(1).max(28).default(10),
  copyFrom: Id.optional(),
})
doc('post', '/org/madrasas', T, 'Add a madrasa (optionally copying another madrasa’s settings)', { body: NewMadrasa, auth: 'org.manage + recent re-authentication' })
orgRouter.post('/org/madrasas', requirePermission('org.manage'), requireRecentAuth(), async (req, res) => {
  res.status(201).json(await org.createMadrasa(req, body(req, NewMadrasa)))
})

const MadrasaPatch = z.object({ name: z.string().trim().min(3).max(120), shortName: z.string().trim().min(2).max(60), nameArabic: z.string().trim().max(120).nullable(), address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().email(), active: z.boolean() }).partial()
doc('patch', '/org/madrasas/:id', T, 'Change or deactivate a madrasa', { body: MadrasaPatch, auth: 'org.manage + recent re-authentication' })
orgRouter.patch('/org/madrasas/:id', requirePermission('org.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await org.updateMadrasa(req, Id.parse(req.params.id), body(req, MadrasaPatch)))
})

const Features = z.partialRecord(z.enum(Feature), z.boolean())
doc('put', '/org/madrasas/:id/features', T, 'Switch modules on or off for a madrasa', { body: Features, auth: 'org.manage' })
orgRouter.put('/org/madrasas/:id/features', requirePermission('org.manage'), async (req, res) => {
  res.json(await org.setFeatures(req, Id.parse(req.params.id), body(req, Features)))
})
