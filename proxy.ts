import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

// Slice 0.2 dual-password gate.
//
// APP_PASSWORD — admin (Cameron). Full access to every surface.
// TESTER_PASSWORD — invited tester. Access ONLY to /scripts and /api/scripts;
//   /scripts list redirects to /scripts/new (history is admin-only).
//
// Both compares run unconditionally (no short-circuit) so timing doesn't
// reveal which password matched. proxy passes role to RSC via header.

const TESTER_PREFIXES = ['/scripts', '/api/scripts']

function timingSafe(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function pathAllowedForTester(pathname: string): boolean {
  return TESTER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
}

export function proxy(request: NextRequest) {
  const adminPw = process.env.APP_PASSWORD
  // Tester password is optional. If unset, only admin path exists.
  const testerPw = process.env.TESTER_PASSWORD ?? ''

  if (!adminPw) {
    return new NextResponse('Auth misconfigured: APP_PASSWORD not set', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const header = request.headers.get('authorization') ?? ''
  let role: 'admin' | 'tester' | null = null

  if (header.startsWith('Basic ')) {
    const decoded = atob(header.slice('Basic '.length))
    const idx = decoded.indexOf(':')
    const password = idx === -1 ? '' : decoded.slice(idx + 1)

    // Run both compares unconditionally — no early return on first match,
    // so timing doesn't leak which password the request was probing.
    const isAdmin = timingSafe(password, adminPw)
    const isTester = testerPw.length > 0 && timingSafe(password, testerPw)

    if (isAdmin) role = 'admin'
    else if (isTester) role = 'tester'
  }

  if (!role) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="skincare-scripter", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    })
  }

  const pathname = request.nextUrl.pathname

  if (role === 'tester') {
    // Block tester from non-script paths
    if (!pathAllowedForTester(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/scripts/new'
      return NextResponse.redirect(url)
    }
    // The /scripts list is admin-only — testers land on the form
    if (pathname === '/scripts') {
      const url = request.nextUrl.clone()
      url.pathname = '/scripts/new'
      return NextResponse.redirect(url)
    }
  }

  // Pass role to downstream so layout/pages can branch UI.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-skincare-role', role)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
