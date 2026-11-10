import { NextResponse, type NextRequest } from 'next/server'
import { apiFetch, hostOf } from '../../../lib/api'

// The browser's forms post here; this server adds the site token and forwards. The browser
// never talks to the MMS API and never chooses a madrasa. Validation is the API's job.

const MAX_FILE = 5 * 1024 * 1024
const MAX_FILES = 5

const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'

/** Only pages of this same site may post here (CSRF). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).hostname.toLowerCase() === hostOf(req.headers)
  } catch {
    return false
  }
}

async function readFiles(form: FormData) {
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_FILES) return { error: NextResponse.json({ error: { code: 'TOO_MANY_DOCUMENTS', message: 'You can attach up to 5 documents.' } }, { status: 422 }) }
  if (files.some((f) => f.size > MAX_FILE)) return { error: NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: 'Files must be 5 MB or smaller.' } }, { status: 413 }) }
  return { files: await Promise.all(files.map(async (f) => ({ name: f.name, contentType: f.type, base64: Buffer.from(await f.arrayBuffer()).toString('base64') }))) }
}

async function forward(req: NextRequest, path: string, body: object) {
  const r = await apiFetch(path, hostOf(req.headers), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), clientIp: clientIp(req) })
  const data = r.status === 204 ? null : await r.json().catch(() => null)
  return new NextResponse(data === null ? null : JSON.stringify(data), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params
  if (!sameOrigin(req)) return NextResponse.json({ error: { code: 'BAD_ORIGIN', message: 'Please submit this form from the website.' } }, { status: 403 })
  try {
    if (action === 'status') return await forward(req, '/applications/status', await req.json())
    if (action !== 'apply' && action !== 'respond') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 })
    const form = await req.formData()
    const read = await readFiles(form)
    if (read.error) return read.error
    const payload = JSON.parse(String(form.get('payload') ?? '{}')) as object
    return await forward(req, action === 'apply' ? '/applications' : '/applications/respond', { ...payload, files: read.files })
  } catch {
    return NextResponse.json({ error: { code: 'BAD_GATEWAY', message: 'The form could not be sent. Please try again.' } }, { status: 502 })
  }
}
