import { NextResponse } from 'next/server';
import { loginStaff, logoutStaff, readSessionToken, requireUser, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email;
    const password = body?.password;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.trim().length === 0 ||
      password.length === 0
    ) {
      return NextResponse.json({ error: 'Email dan kata sandi wajib diisi.' }, { status: 400 });
    }

    const result = await loginStaff(email, password);

    if (!result.success || !result.token) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const response = NextResponse.json({ session: result.session });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (err: any) {
    console.error('API Auth error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}

/** Used by the client AuthContext to restore the current session ("me"). */
export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }
  return NextResponse.json({ session: { user, avatarUrl: null } });
}

export async function DELETE(request: Request) {
  try {
    await logoutStaff(readSessionToken(request));
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (err: any) {
    console.error('API Auth logout error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
