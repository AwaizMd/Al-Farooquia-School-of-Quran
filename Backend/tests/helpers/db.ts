import { prisma as scoped } from '../../src/database/prisma.js'
import { asOrg, tenant, withMadrasa } from '../../src/tenancy/context.js'
import { createMadrasaDefaults } from '../../src/tenancy/defaults.js'
import { forgetMadrasa } from '../../src/tenancy/settings.js'

// Tests read and write fixtures directly. They do it inside the "current" test
// madrasa (like a request would), or organization-wide before one exists.
let current: string | null = null
export const currentMadrasa = () => current
export const useMadrasa = (id: string | null) => {
  current = id
}

// Inside inMadrasa(...) the surrounding context wins.
const run = <T>(fn: () => T | PromiseLike<T>) => (tenant() ? Promise.resolve(fn()) : current ? withMadrasa(current, fn) : asOrg('test fixture', fn))

/** Like the application's client, but each call runs in the current test madrasa. */
export const prisma = new Proxy(scoped, {
  get(target, key) {
    const value = Reflect.get(target, key) as unknown
    if (key === '$transaction') return (fn: (tx: unknown) => unknown) => run(() => (target.$transaction as (f: typeof fn) => unknown)(fn))
    if (typeof key === 'string' && !key.startsWith('$') && value && typeof value === 'object') {
      return new Proxy(value, {
        get(model, op) {
          const f = Reflect.get(model, op) as unknown
          return typeof f === 'function' ? (...args: unknown[]) => run(() => (f as (...a: unknown[]) => unknown).apply(model, args)) : f
        },
      })
    }
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
  },
}) as typeof scoped

/** Run assertions or fixtures in another madrasa (isolation tests). */
export const inMadrasa = <T>(id: string, fn: () => T | PromiseLike<T>) => withMadrasa(id, fn)

// Empty every application table between tests (keeps Prisma's migration table).
export async function resetDatabase() {
  current = null
  const rows = await scoped.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await scoped.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/**
 * Organization + one madrasa with the defaults a real one gets. The first one
 * created becomes the current test madrasa.
 */
export async function seedMadrasa(code = 'MAIN', name = 'Test Madarsa') {
  return asOrg('test fixture', async () => {
    await scoped.organization.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Test Trust', shortName: 'Trust', nameArabic: '', tagline: '', address: 'Hyderabad', phone: '+91 90000 00000', email: 'office@x.test' } })
    const existing = await scoped.madrasa.findUnique({ where: { code } })
    if (existing) {
      current ??= existing.id
      return existing
    }
    const m = await scoped.madrasa.create({ data: { code, name, shortName: code, address: 'Hyderabad', phone: '+91 90000 00000', email: `${code.toLowerCase()}@x.test` } })
    await scoped.$transaction((tx) => createMadrasaDefaults(tx, m.id, { currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 10 }))
    forgetMadrasa(m.id)
    current ??= m.id
    return m
  })
}
