import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { madrasaScope } from '../tenancy/scope.js'

// The pg adapter sends timestamps without an offset, so the server would read them in
// its own TimeZone setting (e.g. Asia/Kolkata on a local or managed database) and store
// them hours off, out of step with now() in SQL. Pin every session to UTC.
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' }) })

/**
 * The only database client the application uses. Queries on madrasa-scoped models
 * are filtered to the current tenant context (src/tenancy); see CLAUDE.md.
 * Raw SQL ($queryRaw) is NOT filtered: it may only lock or read rows by an id that
 * a scoped query has already returned.
 */
export const prisma = base.$extends(madrasaScope)

export type Db = typeof prisma
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
