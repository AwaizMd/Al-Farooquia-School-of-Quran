import { Prisma } from '../generated/prisma/client.js'
import type { Tx } from '../database/prisma.js'
import { tenant } from './context.js'

const LOCKABLE = { students: 'students', groups: 'groups', manual_payment_submissions: 'manual_payment_submissions', staff_profiles: 'staff_profiles', payroll_runs: 'payroll_runs' } as const

/**
 * Lock one row of a madrasa-scoped table for the rest of the transaction. Raw SQL
 * bypasses the scoping extension, so the madrasa filter is applied here: a row of
 * another madrasa is neither locked nor reported. Returns whether the row was found.
 */
export async function lockRow(tx: Tx, table: keyof typeof LOCKABLE, id: string) {
  const t = tenant()
  if (!t) throw new Error(`lockRow(${table}) outside a madrasa context`)
  const scope = t.org ? Prisma.empty : Prisma.sql`AND "madrasaId" = ANY(${[...t.ids]}::uuid[])`
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${LOCKABLE[table]}"`)} WHERE id = ${id}::uuid ${scope} FOR UPDATE`
  return rows.length === 1
}
