import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// CR-01 migration (expand → backfill → contract) against a database in the pre-CR
// shape that holds real-looking records: nothing may be lost, and every row must end
// up in the default madrasa. Runs on its own database next to the test database.
const SERVER = 'postgresql://madarsa:madarsa_local_only@127.0.0.1:54321'
const DB = 'madarsa_migration'
const URL = `${SERVER}/${DB}`
const WORK = resolve('.local/migration-test')
const CR01 = '20261103100000'

function deploy(migrationsDir: string) {
  const config = resolve(WORK, `prisma.config.${Date.now()}.ts`)
  writeFileSync(config, `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrationsDir)} }, datasource: { url: ${JSON.stringify(URL)} } }\n`)
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', config], { env: { ...process.env, DATABASE_URL: URL }, stdio: 'pipe' })
}

let db: pg.Client
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[]
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0]!

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: `${SERVER}/madarsa_test` })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`)
  await admin.query(`CREATE DATABASE ${DB}`)
  await admin.end()
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(resolve(WORK, 'old'), { recursive: true })
  // The migrations as they were before CR-01.
  for (const name of readdirSync('prisma/migrations')) if (name < CR01) cpSync(resolve('prisma/migrations', name), resolve(WORK, 'old', name), { recursive: true })
  deploy(resolve(WORK, 'old'))
  db = new pg.Client({ connectionString: URL })
  await db.connect()

  // A small single-madrasa installation, written in the old shape.
  await db.query(`
    INSERT INTO institution_settings (id, "brandName", "shortName", "brandArabic", tagline, address, phone, email, currency, timezone, "weeklyOff", "feeDueDay", "updatedAt")
      VALUES (1, 'Old Madarsa', 'Old', 'مدرسہ', 'Tagline', 'Hyderabad', '+91 1', 'o@x.test', 'INR', 'Asia/Kolkata', 5, 12, now());
    INSERT INTO users (id, email, "displayName", status, "updatedAt") VALUES
      ('00000000-0000-4000-8000-0000000000a1', 'admin@x.test', 'Admin', 'ACTIVE', now()),
      ('00000000-0000-4000-8000-0000000000a2', 'mentor@x.test', 'Mentor', 'ACTIVE', now()),
      ('00000000-0000-4000-8000-0000000000a3', 'parent@x.test', 'Parent', 'ACTIVE', now());
    INSERT INTO user_roles ("userId", role) VALUES ('00000000-0000-4000-8000-0000000000a1', 'ADMIN'), ('00000000-0000-4000-8000-0000000000a2', 'MENTOR'), ('00000000-0000-4000-8000-0000000000a3', 'PARENT');
    INSERT INTO groups (id, code, name, short, track, gender) VALUES ('00000000-0000-4000-8000-0000000000b1', 'g-a', 'Halqa A', 'A', 'HIFZ', 'BOYS');
    INSERT INTO staff_profiles (id, code, "userId", "displayName", title, "updatedAt") VALUES ('00000000-0000-4000-8000-0000000000c1', 'm1', '00000000-0000-4000-8000-0000000000a2', 'Mentor', 'Hifz Mentor', now());
    INSERT INTO group_mentor_assignments (id, "groupId", "staffId") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1');
    INSERT INTO fee_plans (id, code, name, "amountMinor", currency) VALUES ('00000000-0000-4000-8000-0000000000d1', 'fp', 'Plan', 150000, 'INR');
    INSERT INTO guardians (id, code, "userId", name, relation, phone, "updatedAt") VALUES ('00000000-0000-4000-8000-0000000000e1', 'g1', '00000000-0000-4000-8000-0000000000a3', 'Parent', 'Father', '+91 2', now());
    INSERT INTO students (id, "admissionNo", name, gender, dob, "admissionDate", "groupId", phone, "feePlanId", "updatedAt")
      VALUES ('00000000-0000-4000-8000-0000000000f1', 'S-1001', 'Ali', 'MALE', '2013-01-01', '2024-04-01', '00000000-0000-4000-8000-0000000000b1', '+91 3', '00000000-0000-4000-8000-0000000000d1', now());
    INSERT INTO student_guardians ("studentId", "guardianId", "isPrimary") VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', true);
    INSERT INTO invoices (id, number, "studentId", period, "planId", currency, "grossMinor", "discountMinor", "amountMinor", "issuedOn", "dueDate")
      VALUES ('00000000-0000-4000-8000-000000000101', 'INV-1', '00000000-0000-4000-8000-0000000000f1', '2026-10', '00000000-0000-4000-8000-0000000000d1', 'INR', 150000, 0, 150000, '2026-10-01', '2026-10-12');
    INSERT INTO receipts (id, number) VALUES ('00000000-0000-4000-8000-000000000201', 'NR-2026-0001');
    INSERT INTO receipt_sequences ("fiscalYear", last) VALUES (2026, 1);
    INSERT INTO payments (id, "studentId", "receiptId", "amountMinor", currency, method, source, "receivedOn", reference)
      VALUES ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000201', 50000, 'INR', 'BANK_TRANSFER', 'MANUAL', '2026-10-05', 'UTR123');
    INSERT INTO payment_allocations ("paymentId", "invoiceId", "amountMinor") VALUES ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 50000);
    INSERT INTO attendance_sessions (id, "groupId", date, "updatedAt") VALUES ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000b1', '2026-10-05', now());
    INSERT INTO attendance_records (id, "sessionId", "studentId", date, status, "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000f1', '2026-10-05', 'PRESENT', now());
    INSERT INTO payment_settings ("institutionId", "bankEnabled", "bankAccountName", "updatedAt") VALUES (1, false, 'Trust', now());
  `)
  await db.end()
  deploy(resolve('prisma/migrations'))
  db = new pg.Client({ connectionString: URL })
  await db.connect()
}, 120_000)

afterAll(async () => {
  await db?.end()
})

const SCOPED = ['groups', 'staff_profiles', 'group_mentor_assignments', 'students', 'student_guardians', 'group_enrollments', 'attendance_sessions', 'attendance_records', 'learning_records', 'grading_scales', 'grade_bands', 'exams', 'fee_plans', 'invoices', 'payments', 'payment_allocations', 'receipts', 'receipt_sequences', 'refunds', 'concessions', 'hostel_rooms', 'reminder_rules', 'message_templates', 'scheduled_report_config', 'payment_settings', 'manual_payment_submissions']

describe('CR-01 migration of an existing installation', () => {
  it('creates the organization and madrasa MAIN from the old settings', async () => {
    const m = await one<{ id: string; code: string; name: string }>(`SELECT id, code, name FROM madrasas`)
    expect(m).toMatchObject({ code: 'MAIN', name: 'Old Madarsa' })
    expect(await one(`SELECT name, tagline FROM organizations`)).toEqual({ name: 'Old Madarsa', tagline: 'Tagline' })
    expect(await one(`SELECT currency, timezone, "weeklyOff", "feeDueDay" FROM madrasa_settings`)).toEqual({ currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 12 })
    expect(Number((await one<{ n: string }>(`SELECT count(*) n FROM madrasa_features WHERE enabled`)).n)).toBe(4)
  })

  it('keeps every row and assigns each to MAIN', async () => {
    const { id } = await one<{ id: string }>(`SELECT id FROM madrasas`)
    for (const t of SCOPED) {
      const r = await one<{ total: string; mine: string }>(`SELECT count(*) total, count(*) FILTER (WHERE "madrasaId" = $1) mine FROM ${t}`, [id])
      expect(r.mine, t).toBe(r.total)
    }
    expect(await one(`SELECT count(*)::int n FROM students`)).toEqual({ n: 1 })
    expect(await one(`SELECT "amountMinor", reference FROM payments`)).toEqual({ amountMinor: 50000, reference: 'UTR123' })
    expect(await one(`SELECT "bankAccountName" FROM payment_settings`)).toEqual({ bankAccountName: 'Trust' })
    expect(await one(`SELECT last FROM receipt_sequences WHERE "fiscalYear" = 2026`)).toEqual({ last: 1 })
    expect(await one(`SELECT count(*)::int n FROM institution_settings`)).toEqual({ n: 1 }) // kept, not dropped
  })

  it('moves staff roles to memberships and makes the administrator a Super Admin', async () => {
    const roles = await q<{ email: string; role: string }>(`SELECT u.email, r.role FROM user_roles r JOIN users u ON u.id = r."userId" ORDER BY 1, 2`)
    expect(roles).toEqual([{ email: 'admin@x.test', role: 'SUPER_ADMIN' }, { email: 'parent@x.test', role: 'PARENT' }])
    const mem = await q<{ email: string; role: string }>(`SELECT u.email, m.role FROM madrasa_memberships m JOIN users u ON u.id = m."userId" ORDER BY 1`)
    expect(mem).toEqual([{ email: 'admin@x.test', role: 'MADRASA_ADMIN' }, { email: 'mentor@x.test', role: 'MENTOR' }])
    expect(await one(`SELECT count(*)::int n FROM users WHERE "homeMadrasaId" IS NULL`)).toEqual({ n: 0 })
  })

  it('keeps the fee ledger append-only and enforces the madrasa link from now on', async () => {
    await expect(db.query(`UPDATE payments SET "amountMinor" = 1`)).rejects.toThrow()
    const other = '00000000-0000-4000-8000-00000000ffff'
    await db.query(`INSERT INTO madrasas (id, code, name, "shortName", address, phone, email, "updatedAt") VALUES ($1, 'OTHER', 'Other', 'Other', '', '', '', now())`, [other])
    // A child row cannot claim a different madrasa from its parent.
    await expect(db.query(`INSERT INTO concessions (id, "madrasaId", "studentId", kind, percent) VALUES (gen_random_uuid(), $1, '00000000-0000-4000-8000-0000000000f1', 'SIBLING', 10)`, [other])).rejects.toThrow(/madrasa mismatch/)
    // Without one it inherits the parent's.
    await db.query(`INSERT INTO concessions (id, "studentId", kind, percent) VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000f1', 'SIBLING', 10)`)
    expect(await one(`SELECT m.code FROM concessions c JOIN madrasas m ON m.id = c."madrasaId"`)).toEqual({ code: 'MAIN' })
  })

  it('removed the payment gateway and the library', async () => {
    const tables = (await q<{ t: string }>(`SELECT tablename t FROM pg_tables WHERE schemaname = 'public'`)).map((r) => r.t)
    for (const gone of ['payment_attempts', 'webhook_events', 'library_resources']) expect(tables).not.toContain(gone)
    const cols = (await q<{ c: string }>(`SELECT column_name c FROM information_schema.columns WHERE table_name = 'payment_settings'`)).map((r) => r.c)
    expect(cols.filter((c) => c.toLowerCase().includes('razorpay'))).toEqual([])
    const enums = (await q<{ v: string }>(`SELECT e.enumlabel v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname IN ('PaymentMethod', 'PaymentSource', 'FilePurpose', 'Role')`)).map((r) => r.v)
    for (const gone of ['ONLINE', 'LIBRARY', 'LIBRARIAN', 'ADMIN']) expect(enums).not.toContain(gone)
  })
})
