import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma as scoped } from '../../src/database/prisma.js'
import { applyRetention } from '../../src/modules/site/applications.service.js'
import { asOrg } from '../../src/tenancy/context.js'
import { forgetMadrasa } from '../../src/tenancy/settings.js'
import { PASSWORD, app, client, makeUser, type Client } from '../helpers/auth.js'
import { inMadrasa, prisma, resetDatabase, seedMadrasa } from '../helpers/db.js'
import { seedPeopleFixture } from '../helpers/people.js'

const TOKEN = 'test-site-token-test-site-token-test-site-token'
const HOST = 'main.example.org'
const HOST_B = 'second.example.org'
let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let principal: Client
let bId: string
let principalB: Client

async function as(identifier: string, madrasaId?: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  if (madrasaId) {
    const orig = c.agent
    for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const fn = orig[m].bind(orig)
      ;(orig as unknown as Record<string, unknown>)[m] = (url: string) => fn(url).set('X-Madrasa-Id', madrasaId)
    }
  }
  return c
}
const enable = async (madrasaId: string) => {
  for (const feature of ['HALAQA', 'PUBLIC_WEBSITE'] as const) await asOrg('test', () => scoped.madrasaFeature.upsert({ where: { madrasaId_feature: { madrasaId, feature } }, update: { enabled: true }, create: { madrasaId, feature, enabled: true } }))
  forgetMadrasa(madrasaId)
}
/** What the Next.js server sends. */
const site = (host = HOST, ip: string = randomUUID()) => {
  const h = (r: request.Test) => r.set('X-Site-Token', TOKEN).set('X-Site-Host', host).set('X-Client-Ip', ip)
  return { get: (p: string) => h(request(app).get(`/api/v1/public${p}`)), post: (p: string, b: object) => h(request(app).post(`/api/v1/public${p}`)).send(b) }
}
const freshToken = async (host = HOST) => {
  const token = (await site(host).get('/form-token')).body.token as string
  const [ts, sig] = token.split('.')
  void sig
  vi.setSystemTime(Number(ts) + 5_000)
  return token
}
const submit = async (body: object, host = HOST, ip?: string) => site(host, ip).post('/applications', { type: 'ENQUIRY', applicantName: 'Amina Visitor', phone: '+91 98765 43210', consent: true, answers: { message: 'Do you teach Tajweed?' }, formToken: await freshToken(host), ...body })
const openForm = async (c: Client, type: string, extra: object = {}) => {
  const cfg = (await c.get('/api/v1/site/settings')).body
  cfg.forms[type] = { ...cfg.forms[type], enabled: true, ...extra }
  expect((await c.put('/api/v1/site/settings', cfg)).status).toBe(200)
}
const item = async (c: Client, input: object, publish = true) => {
  const r = await c.post('/api/v1/site/items', input)
  expect(r.status).toBe(201)
  if (publish) expect((await c.post(`/api/v1/site/items/${r.body.id}/status`, { status: 'PUBLISHED' })).status).toBe(200)
  return r.body as { id: string; slug: string }
}

beforeEach(async () => {
  vi.useRealTimers()
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() })
  await resetDatabase()
  fx = await seedPeopleFixture()
  await enable(fx.madrasa.id)
  await inMadrasa(fx.madrasa.id, () => scoped.siteDomain.create({ data: { hostname: HOST } as never }))
  const b = await seedMadrasa('B2', 'Second Madrasa')
  bId = b.id
  await enable(bId)
  await inMadrasa(bId, () => scoped.siteDomain.create({ data: { hostname: HOST_B } as never }))
  await makeUser({ email: 'pb@x.test', roles: ['PRINCIPAL'], madrasaId: bId })
  await makeUser({ email: 'acc@x.test', roles: ['ACCOUNTANT'], madrasaId: fx.madrasa.id })
  await makeUser({ email: 'super@x.test', roles: ['SUPER_ADMIN'], madrasaId: fx.madrasa.id })
  principal = await as('principal@x.test')
  principalB = await as('pb@x.test', bId)
})

describe('the door', () => {
  it('without the server token nothing is there, whatever the host', async () => {
    expect((await request(app).get('/api/v1/public/site').set('X-Site-Host', HOST)).status).toBe(404)
    expect((await request(app).get('/api/v1/public/site').set('X-Site-Host', HOST).set('X-Site-Token', 'wrong')).status).toBe(404)
    expect((await request(app).post('/api/v1/public/applications').set('X-Site-Host', HOST).send({})).status).toBe(404)
  })

  it('an unknown host is not found, and a switched-off website is refused', async () => {
    expect((await site('nobody.example.org').get('/site')).status).toBe(404)
    await asOrg('test', () => scoped.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'PUBLIC_WEBSITE' } }, data: { enabled: false } }))
    forgetMadrasa(fx.madrasa.id)
    expect((await site().get('/site')).body.error.code).toBe('FEATURE_DISABLED')
  })

  it('the hostname decides the madrasa: a madrasa id from the client is ignored', async () => {
    await openForm(principal, 'ENQUIRY')
    await openForm(principalB, 'ENQUIRY')
    const r = await submit({ madrasaId: fx.madrasa.id, applicantName: 'Sent To B' }, HOST_B)
    expect(r.status).toBe(201)
    expect((await principal.get('/api/v1/applications')).body.items).toEqual([])
    expect((await principalB.get('/api/v1/applications')).body.items[0].applicantName).toBe('Sent To B')
  })

  it('a hostname cannot be claimed twice, and needs Principal rights', async () => {
    await principal.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await principal.post('/api/v1/site/domains', { hostname: 'HTTPS-not-a-host/x' })).status).toBe(422)
    expect((await principal.post('/api/v1/site/domains', { hostname: 'New.Example.org' })).body.hostname).toBe('new.example.org')
    await principalB.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await principalB.post('/api/v1/site/domains', { hostname: 'new.example.org' })).body.error.code).toBe('DOMAIN_TAKEN')
    const admin = await as('admin@x.test')
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await admin.post('/api/v1/site/domains', { hostname: 'x.example.org' })).status).toBe(403)
  })
})

describe('what visitors can see', () => {
  it('only published, current items; drafts, future, expired and archived stay private', async () => {
    const pub = await item(principal, { type: 'ANNOUNCEMENT', title: 'Open now' })
    await item(principal, { type: 'ANNOUNCEMENT', title: 'Just a draft' }, false)
    await item(principal, { type: 'ANNOUNCEMENT', title: 'For later', publishAt: new Date(Date.now() + 86_400_000) })
    await item(principal, { type: 'ANNOUNCEMENT', title: 'Long gone', publishAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) })
    const titles = async () => (await site().get('/items?type=ANNOUNCEMENT')).body.items.map((i: { title: string }) => i.title)
    expect(await titles()).toEqual(['Open now'])
    expect((await site().get('/items/ANNOUNCEMENT/just-a-draft')).status).toBe(404)
    expect((await site().get(`/items/ANNOUNCEMENT/${pub.slug}`)).body.title).toBe('Open now')
    expect(Object.keys((await site().get(`/items/ANNOUNCEMENT/${pub.slug}`)).body)).not.toEqual(expect.arrayContaining(['status', 'createdById', 'madrasaId']))
    await principal.post(`/api/v1/site/items/${pub.id}/status`, { status: 'ARCHIVED' })
    expect(await titles()).toEqual([])
    vi.setSystemTime(Date.now() + 2 * 86_400_000)
    expect(await titles()).toEqual(['For later'])
  })

  it('a preview link shows a draft for an hour, on this madrasa only, and cannot be forged', async () => {
    const d = await item(principal, { type: 'ANNOUNCEMENT', title: 'Unpublished draft', body: 'Draft body' }, false)
    expect((await (await as('m1@x.test')).post(`/api/v1/site/items/${d.id}/preview`)).status).toBe(403)
    const { token, url } = (await principal.post(`/api/v1/site/items/${d.id}/preview`)).body
    expect(url).toBe(`https://${HOST}/preview/${token}`)
    expect((await site().get(`/preview/${token}`)).body.title).toBe('Unpublished draft')
    expect((await site(HOST_B).get(`/preview/${token}`)).status).toBe(404)
    expect((await site().get(`/preview/${d.id}.${Date.now() + 3_600_000}.forged`)).status).toBe(404)
    expect((await request(app).get(`/api/v1/public/preview/${token}`).set('X-Site-Host', HOST)).status).toBe(404) // no server token
    expect((await site().get('/items?type=ANNOUNCEMENT')).body.items).toEqual([]) // still not public
    vi.setSystemTime(Date.now() + 61 * 60_000)
    expect((await site().get(`/preview/${token}`)).status).toBe(404)
  })

  it('another madrasa never sees this content', async () => {
    await item(principal, { type: 'PROGRAM', title: 'Main Only' })
    expect((await site(HOST_B).get('/items?type=PROGRAM')).body.items).toEqual([])
    expect((await site(HOST_B).get('/items/PROGRAM/main-only')).status).toBe(404)
  })

  it('an admin can draft but not publish, and editing live content takes it down until approved', async () => {
    const admin = await as('admin@x.test')
    const d = await item(admin, { type: 'FAQ', title: 'When do classes start?' }, false)
    expect((await admin.post(`/api/v1/site/items/${d.id}/status`, { status: 'PUBLISHED' })).status).toBe(403)
    expect((await admin.post(`/api/v1/site/items/${d.id}/status`, { status: 'PENDING_APPROVAL' })).status).toBe(200)
    expect((await site().get('/items?type=FAQ')).body.items).toEqual([])
    expect((await principal.post(`/api/v1/site/items/${d.id}/status`, { status: 'PUBLISHED' })).status).toBe(200)
    expect((await site().get('/items?type=FAQ')).body.items).toHaveLength(1)
    expect((await admin.patch(`/api/v1/site/items/${d.id}`, { title: 'Changed' })).body.status).toBe('DRAFT')
    expect((await site().get('/items?type=FAQ')).body.items).toEqual([])
    expect((await admin.put('/api/v1/site/settings', {})).status).toBe(403)
    expect((await (await as('m1@x.test')).get('/api/v1/site/items')).status).toBe(403)
  })

  it('Halaqas appear only when marked public, with chosen fields and no private data', async () => {
    const cat = (await principal.get('/api/v1/halaqa/categories')).body.items[0].id
    const pub = await principal.post('/api/v1/halaqa', { name: 'Internal name', categoryId: cat, status: 'ACTIVE', isPublic: true, publicName: 'Friday Tafseer', publicDescription: 'Open to all', instructions: 'PRIVATE-INSTRUCTIONS', purpose: 'PRIVATE-PURPOSE', teacherStaffId: fx.staff.m1.id, registrationOpen: true })
    await principal.post('/api/v1/halaqa', { name: 'Private circle', categoryId: cat, status: 'ACTIVE' })
    const p = await principal.post('/api/v1/halaqa/participants', { fullName: 'PRIVATE-PERSON', phone: '+91 98000 77777', isMureed: true })
    await principal.post(`/api/v1/halaqa/${pub.body.id}/members`, { participantId: p.body.id })
    const r = await site().get('/halaqas')
    expect(r.body.items.map((h: { name: string }) => h.name)).toEqual(['Friday Tafseer'])
    const text = JSON.stringify(r.body)
    for (const secret of ['PRIVATE-INSTRUCTIONS', 'PRIVATE-PURPOSE', 'PRIVATE-PERSON', 'Internal name', 'Mentor One', 'activeMembers']) expect(text).not.toContain(secret)
  })

  it('there is no public route to records, documents or applications', async () => {
    for (const p of ['/students', '/staff', '/applications', '/halaqa', '/mureeds', '/site/items', '/fees']) expect((await site().get(p)).status, p).toBe(404)
  })

  it('assets are public by design and belong to their madrasa', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    const up = await principal.agent.post('/api/v1/site/assets').set('X-CSRF-Token', principal.csrf).set('Content-Type', 'image/png').set('X-File-Name', 'hall.png').send(png)
    expect(up.status).toBe(201)
    expect((await site().get(`/assets/${up.body.id}`)).status).toBe(200)
    expect((await site(HOST_B).get(`/assets/${up.body.id}`)).status).toBe(404)
    const svg = await principal.agent.post('/api/v1/site/assets').set('X-CSRF-Token', principal.csrf).set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>'))
    expect(svg.body.error.code).toBe('FILE_CONTENT_MISMATCH')
  })
})

describe('registration', () => {
  beforeEach(async () => { await openForm(principal, 'ENQUIRY') })

  it('a closed form refuses, and missing or invalid fields come back named', async () => {
    expect((await submit({ type: 'MUREED' })).body.error.code).toBe('FORM_CLOSED')
    const bad = await submit({ applicantName: 'A', phone: 'abc', email: 'nope' })
    expect(bad.status).toBe(422)
    const noMsg = await submit({ answers: {} })
    expect(noMsg.body.error.details.map((d: { path: string }) => d.path)).toContain('message')
    const noConsent = await submit({ consent: false, email: 'a@x.test', phone: undefined })
    expect(noConsent.body.error.details.map((d: { path: string }) => d.path)).toContain('consent')
    expect((await submit({ phone: undefined, email: undefined })).body.error.details.map((d: { path: string }) => d.path)).toContain('phone')
  })

  it('creates a pending application with a random reference and history; unknown answers are dropped', async () => {
    const r = await submit({ answers: { message: 'Hello', isAdmin: 'true', status: 'APPROVED' } })
    expect(r.status).toBe(201)
    expect(r.body.reference).toMatch(/^APP-[A-Z2-9]{10}$/)
    const a = (await principal.get('/api/v1/applications')).body.items[0]
    expect(a.status).toBe('PENDING')
    const full = (await principal.get(`/api/v1/applications/${a.id}`)).body
    expect(full.answers).toEqual({ message: 'Hello' })
    expect(full.history[0].kind).toBe('submitted')
    expect(full.consentText).toContain('I agree')
  })

  it('stops bots: honeypot is silent, a form sent too fast or forged is refused', async () => {
    const before = await inMadrasa(fx.madrasa.id, () => scoped.application.count())
    expect((await submit({ website: 'http://spam.example' })).status).toBe(201)
    expect(await inMadrasa(fx.madrasa.id, () => scoped.application.count())).toBe(before)
    const tooFast = (await site().get('/form-token')).body.token
    expect((await site().post('/applications', { type: 'ENQUIRY', applicantName: 'Bot Name', phone: '+91 90000 11111', consent: true, answers: { message: 'x' }, formToken: tooFast })).body.error.code).toBe('FORM_EXPIRED')
    expect((await site().post('/applications', { type: 'ENQUIRY', applicantName: 'Bot Name', phone: '+91 90000 11111', consent: true, answers: { message: 'x' }, formToken: `${Date.now() - 60000}.forged` })).body.error.code).toBe('FORM_EXPIRED')
  })

  it('rate limits by address', async () => {
    const ip = randomUUID()
    const rs = []
    for (let i = 0; i < 12; i++) rs.push((await submit({ phone: `+91 90000 000${10 + i}` }, HOST, ip)).status)
    expect(rs.filter((s) => s === 429).length).toBeGreaterThan(0)
  })

  it('duplicates: same contact refused without revealing the reference; simultaneous sends make one; the window is configurable', async () => {
    expect((await submit({})).status).toBe(201)
    const again = await submit({ phone: '098765-43210' })
    expect(again.body.error.code).toBe('DUPLICATE_APPLICATION')
    expect(JSON.stringify(again.body)).not.toContain('APP-')
    const token = await freshToken()
    const body = { type: 'ENQUIRY', applicantName: 'Double Click', phone: '+91 91111 11111', consent: true, answers: { message: 'Hi there' }, formToken: token }
    const both = await Promise.all([site().post('/applications', body), site().post('/applications', body), site().post('/applications', body)])
    expect(both.map((r) => r.status).sort()).toEqual([201, 409, 409])
    const cfg = (await principal.get('/api/v1/site/settings')).body
    await principal.put('/api/v1/site/settings', { ...cfg, duplicateWindowDays: 0 })
    expect((await submit({})).status).toBe(201)
  })

  it('documents: only where allowed, checked by contents, size and count, and stored privately', async () => {
    const file = (over: object = {}) => ({ name: '../../evil.pdf', contentType: 'application/pdf', label: 'Birth certificate', base64: Buffer.from('%PDF-1.4 test').toString('base64'), ...over })
    expect((await submit({ files: [file()] })).body.error.code).toBe('DOCUMENTS_NOT_ACCEPTED')
    await openForm(principal, 'ADMISSION', { allowDocuments: true })
    const adm = (over: object) => submit({ type: 'ADMISSION', applicantName: 'Student Name', answers: { dob: '2015-01-01', guardianName: 'Guardian', guardianPhone: '+91 98765 43210' }, ...over })
    expect((await adm({ files: [file({ base64: Buffer.from('MZ not a pdf').toString('base64') })] })).body.error.code).toBe('FILE_CONTENT_MISMATCH')
    expect((await adm({ files: [file({ contentType: 'application/x-msdownload' })] })).status).toBe(415)
    expect((await adm({ files: Array.from({ length: 6 }, () => file()) })).status).toBe(422)
    expect((await adm({ files: [file({ base64: Buffer.alloc(5_300_000, 37).toString('base64') })] })).status).toBe(413)
    expect((await adm({ files: [file()] })).status).toBe(201)
    const a = (await principal.get('/api/v1/applications?type=ADMISSION')).body.items[0]
    const doc = (await principal.get(`/api/v1/applications/${a.id}`)).body.documents[0]
    expect(doc.fileName).not.toContain('/')
    expect(doc.storageKey).toBeUndefined()
    expect(JSON.stringify(doc)).not.toMatch(/https?:/)
    expect((await principal.get(`/api/v1/applications/documents/${doc.id}`)).status).toBe(200)
    expect((await request(app).get(`/api/v1/applications/documents/${doc.id}`)).status).toBe(401)
    expect((await site().get(`/assets/${doc.id}`)).status).toBe(404)
  })

  it('a Halaqa application can only target a public, open Halaqa', async () => {
    await openForm(principal, 'HALAQA')
    const cat = (await principal.get('/api/v1/halaqa/categories')).body.items[0].id
    const priv = await principal.post('/api/v1/halaqa', { name: 'Private', categoryId: cat })
    const shut = await principal.post('/api/v1/halaqa', { name: 'Public shut', categoryId: cat, isPublic: true })
    const open = await principal.post('/api/v1/halaqa', { name: 'Public open', categoryId: cat, isPublic: true, registrationOpen: true })
    const go = (halaqaId: string) => submit({ type: 'HALAQA', halaqaId, answers: {} })
    expect((await go(priv.body.id)).status).toBe(422)
    expect((await go(shut.body.id)).status).toBe(422)
    expect((await go(randomUUID())).status).toBe(422)
    expect((await go(open.body.id)).status).toBe(201)
  })

  it('status needs the reference and the contact it was sent with; both failures look the same', async () => {
    const ref = (await submit({})).body.reference
    expect((await site().post('/applications/status', { reference: ref, contact: '+91 98765 43210' })).body).toMatchObject({ status: 'PENDING', type: 'ENQUIRY' })
    const wrongContact = await site().post('/applications/status', { reference: ref, contact: '+91 90000 00000' })
    const wrongRef = await site().post('/applications/status', { reference: 'APP-AAAAAAAAAA', contact: '+91 98765 43210' })
    expect(wrongContact.status).toBe(404)
    expect(wrongRef.status).toBe(404)
    expect(wrongContact.body.error.code).toBe(wrongRef.body.error.code)
    expect(JSON.stringify((await site().post('/applications/status', { reference: ref, contact: '+91 98765 43210' })).body)).not.toContain('Amina')
  })
})

describe('Principal-only access', () => {
  let appId: string
  let docId: string
  beforeEach(async () => {
    await openForm(principal, 'ADMISSION', { allowDocuments: true })
    await submit({ type: 'ADMISSION', applicantName: 'Private Applicant', answers: { dob: '2015-01-01', guardianName: 'Guardian', guardianPhone: '+91 98765 43210' }, files: [{ name: 'a.pdf', contentType: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64') }] })
    appId = (await principal.get('/api/v1/applications')).body.items[0].id
    docId = (await principal.get(`/api/v1/applications/${appId}`)).body.documents[0].id
  })

  it('no other role reaches any application route, not even administrators', async () => {
    for (const who of ['admin@x.test', 'super@x.test', 'm1@x.test', 'acc@x.test', 'p1@x.test', 'warden@x.test', 's-1']) {
      const c = await as(who)
      for (const p of ['/applications', '/applications/stats', `/applications/${appId}`, `/applications/documents/${docId}`]) expect((await c.get(`/api/v1${p}`)).status, `${who} ${p}`).toBe(403)
      expect((await c.post(`/api/v1/applications/${appId}/approve`, {})).status, who).toBe(403)
      expect((await c.post(`/api/v1/applications/${appId}/reject`, { reason: 'Not suitable' })).status, who).toBe(403)
      expect((await c.post(`/api/v1/applications/${appId}/request-info`, { message: 'Tell me more' })).status, who).toBe(403)
    }
    expect((await request(app).get(`/api/v1/applications/${appId}`)).status).toBe(401)
  })

  it('a Principal of another madrasa gets 404 for the application and its document, by id too', async () => {
    expect((await principalB.get('/api/v1/applications')).body.items).toEqual([])
    expect((await principalB.get(`/api/v1/applications/${appId}`)).status).toBe(404)
    expect((await principalB.get(`/api/v1/applications/documents/${docId}`)).status).toBe(404)
    expect((await principalB.post(`/api/v1/applications/${appId}/reject`, { reason: 'Not suitable' })).status).toBe(404)
    expect((await principalB.post(`/api/v1/applications/${appId}/approve`, {})).status).toBe(404)
  })

  it('opening an application or document is audited', async () => {
    await principal.get(`/api/v1/applications/documents/${docId}`)
    const log = await inMadrasa(fx.madrasa.id, () => scoped.auditLog.findMany({ where: { entityId: appId } }))
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['application.submitted', 'application.viewed', 'application.document_viewed']))
    expect(JSON.stringify(log)).not.toContain('Private Applicant')
  })
})

describe('the review workflow', () => {
  beforeEach(async () => { for (const t of ['ADMISSION', 'HALAQA', 'MUREED', 'ENQUIRY']) await openForm(principal, t) })
  const latest = async () => (await principal.get('/api/v1/applications')).body.items[0] as { id: string; reference: string }

  it('admission: approval creates a student and guardian but no login, and keeps the application', async () => {
    await submit({ type: 'ADMISSION', applicantName: 'New Student', email: 'fam@x.test', answers: { dob: '2015-03-01', gender: 'Female', guardianName: 'Parent Person', guardianPhone: '+91 98111 22222', address: 'Some street' } })
    const a = await latest()
    const usersBefore = await prisma.user.count()
    expect((await principal.post(`/api/v1/applications/${a.id}/approve`, {})).body.error.details[0].path).toBe('groupId')
    const r = await principal.post(`/api/v1/applications/${a.id}/approve`, { groupId: fx.groups.gA.id })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('APPROVED')
    const student = await inMadrasa(fx.madrasa.id, () => scoped.student.findUniqueOrThrow({ where: { id: r.body.studentId }, include: { guardians: { include: { guardian: true } } } }))
    expect(student).toMatchObject({ name: 'New Student', gender: 'FEMALE', userId: null })
    expect(student.guardians[0]!.guardian.name).toBe('Parent Person')
    expect(await prisma.user.count()).toBe(usersBefore)
    expect((await principal.post(`/api/v1/applications/${a.id}/approve`, { groupId: fx.groups.gA.id })).body.error.code).toBe('ALREADY_DECIDED')
    expect((await principal.post(`/api/v1/applications/${a.id}/reject`, { reason: 'Changed mind' })).body.error.code).toBe('ALREADY_DECIDED')
  })

  it('Mureed: nobody becomes a Mureed by applying; approval records them and joins the chosen Halaqa', async () => {
    await submit({ type: 'MUREED', applicantName: 'Seeker', email: 'seek@x.test', answers: { background: 'About me' } })
    const a = await latest()
    expect((await principal.get('/api/v1/halaqa/participants?mureed=true')).body.items).toEqual([])
    const cat = (await principal.get('/api/v1/halaqa/categories')).body.items[0].id
    const h = await principal.post('/api/v1/halaqa', { name: 'Gathering', categoryId: cat, status: 'ACTIVE' })
    const r = await principal.post(`/api/v1/applications/${a.id}/approve`, { halaqaId: h.body.id })
    expect(r.body.participantId).toBeTruthy()
    expect((await principal.get('/api/v1/halaqa/participants?mureed=true')).body.items[0]).toMatchObject({ fullName: 'Seeker', isMureed: true })
    expect((await principal.get(`/api/v1/halaqa/${h.body.id}/members`)).body.items).toHaveLength(1)
  })

  it('approval never makes a second person: it asks to link, and linking uses the existing record', async () => {
    const existing = await principal.post('/api/v1/halaqa/participants', { fullName: 'Already Here', phone: '+91 98765 43210' })
    await submit({ type: 'MUREED', applicantName: 'Same Person', answers: { background: 'About me' } })
    const a = await latest()
    const first = await principal.post(`/api/v1/applications/${a.id}/approve`, {})
    expect(first.body.error.code).toBe('PARTICIPANT_EXISTS')
    expect(first.body.error.details.participantId).toBe(existing.body.id)
    const r = await principal.post(`/api/v1/applications/${a.id}/approve`, { existingParticipantId: existing.body.id })
    expect(r.body.participantId).toBe(existing.body.id)
    expect((await principal.get('/api/v1/halaqa/participants')).body.total).toBe(1)
    expect((await principal.get(`/api/v1/mureeds/${existing.body.id}`)).status).toBe(200)
  })

  it('a failed approval changes nothing; two decisions at once make one', async () => {
    const cat = (await principal.get('/api/v1/halaqa/categories')).body.items[0].id
    const full = await principal.post('/api/v1/halaqa', { name: 'Full', categoryId: cat, status: 'ACTIVE', isPublic: true, registrationOpen: true, maxParticipants: 1 })
    const p = await principal.post('/api/v1/halaqa/participants', { fullName: 'Takes Seat', phone: '+91 98000 00300' })
    await principal.post(`/api/v1/halaqa/${full.body.id}/members`, { participantId: p.body.id })
    await submit({ type: 'HALAQA', halaqaId: full.body.id, applicantName: 'Too Late', phone: '+91 98000 00301', answers: {} })
    const a = await latest()
    expect((await principal.post(`/api/v1/applications/${a.id}/approve`, {})).body.error.code).toBe('HALAQA_FULL')
    expect((await principal.get(`/api/v1/applications/${a.id}`)).body.status).toBe('PENDING')
    expect((await principal.get('/api/v1/halaqa/participants')).body.total).toBe(1)
    const both = await Promise.all([principal.post(`/api/v1/applications/${a.id}/reject`, { reason: 'Halaqa is full' }), principal.post(`/api/v1/applications/${a.id}/close`, { note: 'Done' })])
    expect(both.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('rejection keeps the record and the reason private; the history cannot be rewritten', async () => {
    await submit({ applicantName: 'Declined', email: 'd@x.test' })
    const a = await latest()
    const cfg = (await principal.get('/api/v1/site/settings')).body
    await principal.put('/api/v1/site/settings', { ...cfg, notifyApplicants: true })
    const r = await principal.post(`/api/v1/applications/${a.id}/reject`, { reason: 'INTERNAL-REASON-TEXT' })
    expect(r.body.history.map((h: { kind: string; note: string }) => h.kind)).toEqual(['submitted', 'rejected'])
    const mail = await prisma.notificationDelivery.findMany({ where: { recipient: 'd@x.test' } })
    expect(mail.length).toBeGreaterThan(0)
    expect(JSON.stringify(mail)).not.toContain('INTERNAL-REASON-TEXT')
    await inMadrasa(fx.madrasa.id, () => expect(scoped.applicationEvent.deleteMany({ where: { applicationId: a.id } })).rejects.toThrow())
  })

  it('more information: a one-use link returns it to pending; expired and reused links fail', async () => {
    await submit({ applicantName: 'Needs Info', email: 'n@x.test' })
    const a = await latest()
    const r = await principal.post(`/api/v1/applications/${a.id}/request-info`, { message: 'Please send your address.' })
    expect(r.body.status).toBe('INFO_REQUESTED')
    const token = new URL(r.body.responseLink).searchParams.get('token')!
    expect((await prisma.notificationDelivery.findMany({ where: { recipient: 'n@x.test' } }))[0]!.body).toContain(token)
    const stored = await inMadrasa(fx.madrasa.id, () => scoped.application.findUniqueOrThrow({ where: { id: a.id } }))
    expect(stored.respondTokenHash).not.toBe(token)
    expect((await site().post('/applications/respond', { token: 'x'.repeat(43), message: 'Hello there' })).status).toBe(404)
    expect((await site().post('/applications/respond', { token, message: 'My address is here' })).status).toBe(204)
    const after = (await principal.get(`/api/v1/applications/${a.id}`)).body
    expect(after.status).toBe('PENDING')
    expect(after.history.at(-1)).toMatchObject({ kind: 'applicant_responded', note: 'My address is here' })
    expect((await site().post('/applications/respond', { token, message: 'Again' })).status).toBe(404)
    const again = await principal.post(`/api/v1/applications/${a.id}/request-info`, { message: 'One more thing please.' })
    vi.setSystemTime(Date.now() + 15 * 86_400_000)
    expect((await site().post('/applications/respond', { token: new URL(again.body.responseLink).searchParams.get('token')!, message: 'Late reply' })).status).toBe(404)
  })

  it('statistics count real records', async () => {
    await submit({ applicantName: 'One Person' })
    await submit({ applicantName: 'Two Person', phone: '+91 98000 00401' })
    const a = await latest()
    await principal.post(`/api/v1/applications/${a.id}/reject`, { reason: 'Not suitable' })
    expect((await principal.get('/api/v1/applications/stats')).body).toMatchObject({ total: 2, pending: 1, rejected: 1, approved: 0, newEnquiries: 1 })
  })

  it('retention and removal on request clear personal data and files, and keep the reference', async () => {
    await submit({ applicantName: 'Old Applicant', email: 'old@x.test' })
    const a = await latest()
    expect((await principal.del(`/api/v1/applications/${a.id}/personal-data`)).status).toBeGreaterThanOrEqual(403)
    await principal.post(`/api/v1/applications/${a.id}/close`, {})
    const cfg = (await principal.get('/api/v1/site/settings')).body
    await principal.put('/api/v1/site/settings', { ...cfg, retentionDays: 30 })
    expect(await inMadrasa(fx.madrasa.id, () => applyRetention())).toEqual({ anonymised: 0 })
    vi.setSystemTime(Date.now() + 31 * 86_400_000)
    expect(await inMadrasa(fx.madrasa.id, () => applyRetention())).toEqual({ anonymised: 1 })
    principal = await as('principal@x.test')
    const after = (await principal.get(`/api/v1/applications/${a.id}`)).body
    expect(after).toMatchObject({ applicantName: 'Removed', phone: null, email: null, answers: {}, reference: a.reference })
    expect(after.history.at(-1).kind).toBe('data_removed')
  })
})
