import { NextResponse, type NextRequest } from 'next/server'

// English lives at the root and Arabic under /ar, so each language has one address for search
// engines. Also sets a per-request Content Security Policy: Next.js marks its own scripts with
// this nonce, and nothing else may run.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname === '/en' || pathname.startsWith('/en/')) return NextResponse.redirect(new URL((pathname.slice(3) || '/') + search, req.url), 308)

  const nonce = btoa(crypto.randomUUID())
  const dev = process.env.NODE_ENV !== 'production'
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`, "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ')
  const headers = new Headers(req.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  const url = req.nextUrl.clone()
  const isAr = pathname === '/ar' || pathname.startsWith('/ar/')
  if (!isAr) url.pathname = `/en${pathname === '/' ? '' : pathname}`
  const res = isAr ? NextResponse.next({ request: { headers } }) : NextResponse.rewrite(url, { request: { headers } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = { matcher: ['/((?!_next/|api/|site-assets/|robots.txt|sitemap.xml|favicon.ico).*)'] }
