import { NextResponse } from 'next/server';
import { getAiStatus } from '@/lib/ai';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Status konfigurasi LLM untuk UI. Sengaja tidak mengembalikan API key,
 * hanya apakah LLM aktif, penyedia, dan nama model.
 */
export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  return NextResponse.json(getAiStatus());
}
