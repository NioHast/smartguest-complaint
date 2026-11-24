import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 mengganti nama Middleware menjadi Proxy (API-nya sama).
// Gerbang optimistis: hanya memeriksa keberadaan cookie sesi.
// Validasi sebenarnya dilakukan di route API melalui tabel sessions.
const SESSION_COOKIE = 'smartguest_session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/', '/api/complaints/:path*'],
};
