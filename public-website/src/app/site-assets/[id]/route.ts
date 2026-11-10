import { NextResponse, type NextRequest } from 'next/server'
import { apiFetch, hostOf } from '../../../lib/api'

// Images published through the CMS. The API only ever serves this madrasa's own public images.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 })
  const r = await apiFetch(`/assets/${id}`, hostOf(req.headers))
  if (!r.ok) return new NextResponse(null, { status: 404 })
  return new NextResponse(await r.arrayBuffer(), { headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
}
