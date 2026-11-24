import { NextResponse } from 'next/server';
import { dbService } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ClassifierError, classifyComplaint, type ClassificationResult } from '@/lib/ai';
import { CHANNELS, type Channel } from '@/lib/types';

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    const complaints = await dbService.getComplaints();
    return NextResponse.json({ complaints });
  } catch (err) {
    console.error('API daftar keluhan gagal:', err);
    return NextResponse.json({ error: 'Gagal memuat daftar keluhan.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : '';

    if (!rawText) {
      return NextResponse.json({ error: 'Teks keluhan wajib diisi.' }, { status: 400 });
    }

    const channel = body.channel;
    if (!CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: 'Kanal tidak valid. Gunakan front_desk, phone, whatsapp, email, atau other.' },
        { status: 400 }
      );
    }

    const guestName = typeof body.guest_name === 'string' && body.guest_name.trim() ? body.guest_name.trim() : null;
    const roomNumber = typeof body.room_number === 'string' && body.room_number.trim() ? body.room_number.trim() : null;

    // Klasifikasi AI wajib berhasil; tanpa hasil klasifikasi keluhan tidak disimpan.
    let classification: ClassificationResult;
    try {
      classification = await classifyComplaint(rawText);
    } catch (err) {
      if (err instanceof ClassifierError) {
        const status = err.code === 'NOT_CONFIGURED' ? 503 : 502;
        return NextResponse.json({ error: err.message }, { status });
      }
      throw err;
    }

    const complaint = await dbService.createComplaint({
      guest_name: guestName,
      room_number: roomNumber,
      channel: channel as Channel,
      raw_text: rawText,
      ai_category: classification.category,
      ai_confidence: classification.confidence,
      ai_reason: classification.reason,
      summary: rawText,
      ai_response_raw: {
        kategori: classification.category,
        confidence: classification.confidence,
        alasan: classification.reason,
      },
      created_by: user.id,
      actor: user.full_name,
    });

    return NextResponse.json({ complaint }, { status: 201 });
  } catch (err) {
    console.error('API catat keluhan gagal:', err);
    return NextResponse.json({ error: 'Gagal mencatat keluhan.' }, { status: 500 });
  }
}
