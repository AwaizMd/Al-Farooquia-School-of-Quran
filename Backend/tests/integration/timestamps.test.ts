import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { client, makeUser } from '../helpers/auth.js'

// The test database runs with TimeZone=Asia/Kolkata (see globalSetup), like a
// managed database set to local time. App-written and SQL now() times must agree.
describe('timestamps on a non-UTC database server', () => {
  it('stores an app-written time as the same instant the database calls now()', async () => {
    const u = await makeUser({ email: 'tz@x.test', roles: ['PARENT'] })
    await prisma.user.update({ where: { id: u.id }, data: { passwordChangedAt: new Date() } })
    const [row] = await prisma.$queryRaw<{ skew: number }[]>`SELECT abs(extract(epoch FROM now() - "passwordChangedAt"))::float AS skew FROM users WHERE id = ${u.id}::uuid`
    expect(row!.skew).toBeLessThan(60)
  })

  it('tells a rate-limited client the real wait, not one shifted by the server offset', async () => {
    await makeUser({ email: 'tz2@x.test', roles: ['PARENT'] })
    let r
    for (let i = 0; i < 9; i++) r = await client().post('/api/v1/auth/login', { identifier: 'tz2@x.test', password: 'wrong password 1' })
    expect(r!.status).toBe(429)
    const wait = Number(r!.headers['retry-after'])
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(15 * 60)
  })
})
