import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'

// The pg adapter sends timestamps without an offset, so the server would read them in
// its own TimeZone setting (e.g. Asia/Kolkata on a local or managed database) and store
// them hours off, out of step with now() in SQL. Pin every session to UTC.
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' }) })

export type Db = typeof prisma
