import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

// Public scripter, admin backend.
//
// Public (no auth):
//   /scripts/new           — form
//   /scripts/[id]          — result page
//   /api/scripts/*         — generation endpoint
//
// Admin (APP_PASSWORD required):
//   /scripts               — drafts list (history view, admin tool)
//   /, /upload, /products, /knowledge, /search, /trust, all other /api/*
//
// Admin Basic Auth on public paths is OPTIONAL: when the browser sends
// cached admin creds, proxy verifies and tags the request with
// x-skincare-role so the layout shows the full admin nav. Public visitors
// without creds pass through with no role tag.

function isPublicPath(pathname: string): boolean {
  // /scripts (exact) is admin-only — drafts list. Subpaths are public.
  if (pathname === '/scripts') return false
  if (pathname.startsWith('/scripts/')) return true
  if (pathname.startsWith('/api/scripts/')) return true
  return false
}

function adminAuthFromHeader(
  header: string,
  expected: string,
): boolean {
  if (!header.startsWith('Basic ')) return false
  const decoded = atob(header.slice('Basic '.length))
  const idx = decoded.indexOf(':')
  const password = idx === -1 ? '' : decoded.slice(idx + 1)
  const bufA = Buffer.from(password)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function proxy(request: NextRequest) {
  const adminPw = process.env.APP_PASSWORD
  if (!adminPw) {
    return new NextResponse('Auth misconfigured: APP_PASSWORD not set', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const pathname = request.nextUrl.pathname
  const header = request.headers.get('authorization') ?? ''
  const isAdmin = adminAuthFromHeader(header, adminPw)

  if (isPublicPath(pathname)) {
    // Open to everyone. Tag the request with role=admin if admin creds
    // were sent so the layout can show the full nav for Cameron browsing
    // the public surface.
    if (isAdmin) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-skincare-role', 'admin')
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    return NextResponse.next()
  }

  // Admin-only path: require valid admin creds.
  if (!isAdmin) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="skincare-scripter", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    })
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-skincare-role', 'admin')
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
