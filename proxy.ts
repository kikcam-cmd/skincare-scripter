import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD
  if (!expected) {
    return new NextResponse('Auth misconfigured: APP_PASSWORD not set', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const header = request.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    const decoded = atob(header.slice('Basic '.length))
    const idx = decoded.indexOf(':')
    const password = idx === -1 ? '' : decoded.slice(idx + 1)
    if (password === expected) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="skincare-scripter", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
