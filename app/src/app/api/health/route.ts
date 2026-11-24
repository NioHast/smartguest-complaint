import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = healthCheck();
  return NextResponse.json(
    { status: result.ok ? 'ok' : 'error', db: result.db, version: result.version },
    { status: result.ok ? 200 : 500 }
  );
}
