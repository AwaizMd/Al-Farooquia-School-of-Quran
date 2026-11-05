import { AsyncLocalStorage } from 'node:async_hooks'
import { AppError } from '../common/errors.js'

/**
 * Which madrasa(s) the current request or job works in (CR-01 §1).
 * - `ids`: madrasas whose records may be read (usually just the active one; a
 *   parent with children in several madrasas reads across all of theirs).
 * - `active`: the madrasa new records belong to (null: read-only across `ids`).
 * - `org`: set only by asOrg(): an explicitly marked organization-wide operation.
 */
export interface TenantContext {
  readonly ids: readonly string[]
  readonly active: string | null
  readonly org?: string
}

const store = new AsyncLocalStorage<TenantContext>()

export const tenant = () => store.getStore()

// Prisma queries are lazy: they run when awaited. Awaiting inside the context makes
// sure a query started in `fn` also runs in it, not in the caller's context.
const within = <T>(ctx: TenantContext, fn: () => T | PromiseLike<T>): Promise<T> => store.run(ctx, async () => await fn())

/** Run `fn` inside one madrasa (jobs, scripts, tests, and writes on a parent's behalf). */
export const withMadrasa = <T>(madrasaId: string, fn: () => T | PromiseLike<T>): Promise<T> => within({ ids: [madrasaId], active: madrasaId }, fn)

/** For middleware: continue the request (`next`) inside a context. */
export const runInTenant = (ctx: TenantContext, next: () => void) => store.run(ctx, next)

/**
 * Organization-wide work that legitimately spans madrasas (resolving a user's
 * memberships, consolidated reports, the worker's per-madrasa fan-out). The reason
 * is required so every unscoped query is greppable and reviewable.
 */
export const asOrg = <T>(reason: string, fn: () => T | PromiseLike<T>): Promise<T> => within({ ids: [], active: null, org: reason }, fn)

/** The active madrasa, for code that creates records or reads its settings. */
export function activeMadrasaId(): string {
  const t = tenant()
  if (!t?.active) throw new AppError(400, 'MADRASA_REQUIRED', 'Choose a madrasa first.')
  return t.active
}
