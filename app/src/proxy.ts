import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 mengganti nama Middleware menjadi Proxy (API-nya sama).
// Gerbang optimistis: hanya memeriksa keberadaan cookie sesi.
// Validasi sebenarnya dilakukan di route API melalui tabel sessions.
const SESSION_COOKIE = 'smartguest_session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSessionCookie) {
    // Redirect status harus dikirim sebelum shell klien mulai di-stream.
    // Redirect di page tetap ada sebagai jalur kanonik di server component.
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dasbor', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/',
    '/dasbor/:path*',
    '/catat/:path*',
    '/keluhan/:path*',
    '/qr/:path*',
    '/api/complaints/:path*',
  ],
};
