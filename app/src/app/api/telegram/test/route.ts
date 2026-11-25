import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { notifyDepartment } from '@/lib/notifier';
import { CATEGORY_LABELS, DEPARTMENTS, type CategoryCode, type DepartmentCode } from '@/lib/types';
import { CATEGORY_TO_DEPARTMENT } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

/** Label kategori contoh untuk departemen yang diuji. */
function sampleCategoryLabel(department: DepartmentCode): string {
  const category = (Object.keys(CATEGORY_TO_DEPARTMENT) as CategoryCode[]).find(
    (code) => CATEGORY_TO_DEPARTMENT[code] === department
  );
  return category ? CATEGORY_LABELS[category] : 'Perlu Ditinjau';
}

/**
 * Tes koneksi notifikasi Telegram (POST). Wajib sesi; tidak pernah
 * mengembalikan token. Tanpa TELEGRAM_BOT_TOKEN hasilnya
 * `{ ok: true, sent: false, skipped: 'not-configured' }`.
 */
export async function POST(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get('departemen') ?? 'front_office';
  if (!DEPARTMENTS.includes(requested as DepartmentCode)) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: `Departemen tidak valid. Gunakan salah satu: ${DEPARTMENTS.join(', ')}.`,
      },
      { status: 400 }
    );
  }

  const department = requested as DepartmentCode;
  const result = await notifyDepartment({
    department,
    complaintId: `test-${Date.now()}`,
    roomNumber: '000',
    categoryLabel: sampleCategoryLabel(department),
    rawText: 'Pesan uji dari SmartGuest Complaint.',
  });

  return NextResponse.json({
    ok: !result.error,
    sent: result.sent,
    ...(result.skipped ? { skipped: result.skipped } : {}),
    ...(result.error ? { error: result.error } : {}),
  });
}
