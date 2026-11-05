import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Feature } from '../../generated/prisma/enums.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { activeMadrasaId, asOrg, tenant, withMadrasa } from '../../tenancy/context.js'
import { createMadrasaDefaults } from '../../tenancy/defaults.js'
import { FEATURES, MadrasaConfig, forgetMadrasa, madrasaProfile } from '../../tenancy/settings.js'
import { audit } from '../audit-logs/audit.service.js'

// Organization (the trust) and its madrasas (CR-01 §1). Creating madrasas and
// switching modules on or off is for Super Admins (org.manage); a madrasa's own
// details and configuration are for its administrators (settings.manage).

const ORG_ID = 1

export async function organization() {
  return asOrg('organization profile', () => prisma.organization.findUnique({ where: { id: ORG_ID } }))
}

/**
 * The settings screen and the app's branding: the madrasa's own details (name,
 * address, money and calendar rules) on top of the organization's. Shape kept
 * compatible with the single-madrasa API.
 */
export async function settingsView() {
  const org = await organization()
  const t = tenant()
  const id = t?.active ?? (t?.ids.length === 1 ? t.ids[0] : undefined)
  if (!id) {
    // A family reading across several madrasas: organization branding only.
    return { brandName: org?.name ?? 'Madarsa', shortName: org?.shortName ?? 'Madarsa', brandArabic: org?.nameArabic ?? '', tagline: org?.tagline ?? '', address: org?.address ?? '', phone: org?.phone ?? '', email: org?.email ?? '', currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 10, organization: org, madrasa: null }
  }
  const [m, p] = await Promise.all([asOrg('madrasa details', () => prisma.madrasa.findUniqueOrThrow({ where: { id } })), madrasaProfile(id)])
  return {
    brandName: m.name, shortName: m.shortName, brandArabic: m.nameArabic ?? org?.nameArabic ?? '', tagline: org?.tagline ?? '', address: m.address, phone: m.phone, email: m.email,
    currency: p.currency, timezone: p.timezone, weeklyOff: p.weeklyOff, feeDueDay: p.feeDueDay,
    organization: org, madrasa: { id: m.id, code: m.code, name: m.name, shortName: m.shortName }, config: p.config, features: p.features,
  }
}

export interface SettingsPatch {
  brandName?: string | undefined; shortName?: string | undefined; brandArabic?: string | undefined; tagline?: string | undefined; address?: string | undefined
  phone?: string | undefined; email?: string | undefined; currency?: string | undefined; timezone?: string | undefined; weeklyOff?: number | undefined; feeDueDay?: number | undefined
}

export async function updateSettings(req: Request, patch: SettingsPatch) {
  const id = activeMadrasaId()
  if (patch.tagline !== undefined && !req.auth!.permissions.has('org.manage')) throw new AppError(403, 'FORBIDDEN', 'The tagline belongs to the organization; ask a Super Admin.')
  await asOrg('update one madrasa’s own details', () => prisma.$transaction(async (tx) => {
    const m: Prisma.MadrasaUpdateInput = {}
    if (patch.brandName !== undefined) m.name = patch.brandName
    if (patch.shortName !== undefined) m.shortName = patch.shortName
    if (patch.brandArabic !== undefined) m.nameArabic = patch.brandArabic || null
    if (patch.address !== undefined) m.address = patch.address
    if (patch.phone !== undefined) m.phone = patch.phone
    if (patch.email !== undefined) m.email = patch.email
    if (Object.keys(m).length) await tx.madrasa.update({ where: { id }, data: m })
    const s: Prisma.MadrasaSettingsUpdateInput = {}
    if (patch.currency !== undefined) s.currency = patch.currency
    if (patch.timezone !== undefined) s.timezone = patch.timezone
    if (patch.weeklyOff !== undefined) s.weeklyOff = patch.weeklyOff
    if (patch.feeDueDay !== undefined) s.feeDueDay = patch.feeDueDay
    if (Object.keys(s).length) await tx.madrasaSettings.update({ where: { madrasaId: id }, data: s })
    if (patch.tagline !== undefined) await tx.organization.update({ where: { id: ORG_ID }, data: { tagline: patch.tagline } })
    await audit({ action: 'settings.updated', summary: `Settings updated: ${Object.keys(patch).join(', ')}`, entityType: 'madrasa', entityId: id }, req, tx)
  }))
  forgetMadrasa(id)
  return settingsView()
}

/** Change part of the madrasa's configuration; the result is validated as a whole. */
export async function updateConfig(req: Request, patch: Record<string, unknown>) {
  const id = activeMadrasaId()
  const current = (await madrasaProfile(id)).config
  const merged: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(patch)) merged[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(current[k as keyof MadrasaConfig] as object), ...(v as object) } : v
  const parsed = MadrasaConfig.safeParse(merged)
  if (!parsed.success) throw new AppError(422, 'VALIDATION_FAILED', 'Some settings are invalid.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  await asOrg('update one madrasa’s configuration', () => prisma.madrasaSettings.update({ where: { madrasaId: id }, data: { config: parsed.data } }))
  await audit({ action: 'settings.config_changed', summary: `Configuration changed: ${Object.keys(patch).join(', ')}`, entityType: 'madrasa', entityId: id, metadata: { keys: Object.keys(patch) } }, req)
  forgetMadrasa(id)
  return (await madrasaProfile(id)).config
}

export async function setFeatures(req: Request, madrasaId: string, features: Partial<Record<Feature, boolean>>) {
  await asOrg('switch modules for a madrasa', async () => {
    if (!(await prisma.madrasa.findUnique({ where: { id: madrasaId } }))) throw notFound()
    for (const [feature, enabled] of Object.entries(features) as [Feature, boolean][]) {
      await prisma.madrasaFeature.upsert({ where: { madrasaId_feature: { madrasaId, feature } }, create: { madrasaId, feature, enabled }, update: { enabled } })
    }
  })
  await audit({ action: 'madrasa.features_changed', summary: Object.entries(features).map(([f, on]) => `${f} ${on ? 'on' : 'off'}`).join(', '), entityType: 'madrasa', entityId: madrasaId }, req)
  forgetMadrasa(madrasaId)
  return (await madrasaProfile(madrasaId)).features
}

// ---------- Madrasas ----------

export async function listMadrasas() {
  const rows = await asOrg('list madrasas', () => prisma.madrasa.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { students: { where: { status: 'ACTIVE' } }, memberships: { where: { active: true } } } } } }))
  return { items: await Promise.all(rows.map(async ({ _count, ...m }) => ({ ...m, students: _count.students, staff: _count.memberships, features: (await madrasaProfile(m.id)).features }))) }
}

export interface NewMadrasa {
  code: string; name: string; shortName: string; nameArabic?: string | undefined; address: string; phone: string; email: string
  currency: string; timezone: string; weeklyOff: number; feeDueDay: number
  /** Start from another madrasa's configuration, modules, grading scale and reminder settings. */
  copyFrom?: string | undefined
}

export async function createMadrasa(req: Request, input: NewMadrasa) {
  const code = input.code.trim().toUpperCase()
  const source = input.copyFrom ? await copySource(input.copyFrom) : null
  const created = await asOrg('create a madrasa', async () => {
    if (await prisma.madrasa.findUnique({ where: { code } })) throw conflict('CODE_TAKEN', 'Another madrasa already uses this code.')
    if (!(await prisma.organization.findUnique({ where: { id: ORG_ID } }))) throw conflict('NO_ORGANIZATION', 'Set up the organization first.')
    return prisma.$transaction(async (tx) => {
      const m = await tx.madrasa.create({ data: { code, name: input.name, shortName: input.shortName, nameArabic: input.nameArabic ?? null, address: input.address, phone: input.phone, email: input.email } })
      await createMadrasaDefaults(tx, m.id, { currency: input.currency, timezone: input.timezone, weeklyOff: input.weeklyOff, feeDueDay: input.feeDueDay, ...(source ? { config: source.config, features: source.features } : {}) })
      if (source) {
        await withMadrasa(m.id, async () => {
          const scale = await tx.gradingScale.findFirstOrThrow({ where: { active: true } })
          await tx.gradeBand.deleteMany({ where: { scaleId: scale.id } })
          await tx.gradeBand.createMany({ data: source.bands.map((b) => ({ ...b, scaleId: scale.id })) })
          for (const r of source.rules) await tx.reminderRule.update({ where: { madrasaId_key: { madrasaId: m.id, key: r.key } }, data: { enabled: r.enabled, offsetDays: r.offsetDays, channels: r.channels } }).catch(() => undefined)
          if (source.template) await tx.messageTemplate.update({ where: { madrasaId_key: { madrasaId: m.id, key: 'fee_reminder' } }, data: { subject: source.template.subject, body: source.template.body } })
          if (source.report) await tx.scheduledReportConfig.update({ where: { madrasaId: m.id }, data: { enabled: source.report.enabled, frequency: source.report.frequency, dayOfWeek: source.report.dayOfWeek, dayOfMonth: source.report.dayOfMonth, sendAt: source.report.sendAt, channels: source.report.channels, sections: source.report.sections } })
        })
      }
      await audit({ action: 'madrasa.created', summary: `Madrasa ${m.name} (${m.code}) created${source ? ' from another madrasa’s settings' : ''}`, entityType: 'madrasa', entityId: m.id, metadata: input.copyFrom ? { copyFrom: input.copyFrom } : undefined }, req, tx)
      return m
    })
  })
  return created
}

/** What a new madrasa copies from an existing one (never people, money or bank details). */
async function copySource(id: string) {
  const exists = await asOrg('check copy source', () => prisma.madrasa.findUnique({ where: { id } }))
  if (!exists) throw notFound()
  const p = await madrasaProfile(id)
  return withMadrasa(id, async () => {
    const scale = await prisma.gradingScale.findFirst({ where: { active: true }, include: { bands: true } })
    return {
      config: p.config as unknown as Prisma.InputJsonValue,
      features: p.features,
      bands: (scale?.bands ?? []).map((b) => ({ grade: b.grade, arabic: b.arabic, minPercent: b.minPercent, meaning: b.meaning })),
      rules: await prisma.reminderRule.findMany(),
      template: await prisma.messageTemplate.findFirst({ where: { key: 'fee_reminder' } }),
      report: await prisma.scheduledReportConfig.findFirst(),
    }
  })
}

export async function updateMadrasa(req: Request, id: string, patch: { name?: string | undefined; shortName?: string | undefined; nameArabic?: string | null | undefined; address?: string | undefined; phone?: string | undefined; email?: string | undefined; active?: boolean | undefined }) {
  const m = await asOrg('update a madrasa', async () => {
    if (!(await prisma.madrasa.findUnique({ where: { id } }))) throw notFound()
    if (patch.active === false && (await prisma.madrasa.count({ where: { active: true, id: { not: id } } })) === 0) throw conflict('LAST_MADRASA', 'At least one madrasa must stay active.')
    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Prisma.MadrasaUpdateInput
    return prisma.madrasa.update({ where: { id }, data })
  })
  await audit({ action: patch.active === false ? 'madrasa.deactivated' : 'madrasa.updated', summary: `${m.name}: ${Object.keys(patch).join(', ')} changed`, entityType: 'madrasa', entityId: id }, req)
  forgetMadrasa(id)
  return m
}

export async function updateOrganization(req: Request, patch: { name?: string | undefined; shortName?: string | undefined; nameArabic?: string | undefined; tagline?: string | undefined; address?: string | undefined; phone?: string | undefined; email?: string | undefined }) {
  const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const org = await asOrg('update the organization', () => prisma.organization.update({ where: { id: ORG_ID }, data }))
  await audit({ action: 'organization.updated', summary: `Organization details changed: ${Object.keys(data).join(', ')}`, entityType: 'organization' }, req)
  return org
}

export const FEATURE_LIST = FEATURES
