import { NextResponse, after } from 'next/server';
import { dbService } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ClassifierError, classifyComplaint, type ClassificationResult } from '@/lib/ai';
import { notifyDepartment } from '@/lib/notifier';
import { CHANNELS, categoryLabel, type Channel } from '@/lib/types';
import { validateComplaintInput } from '@/lib/validation';

/** Alasan generik untuk kegagalan AI di luar `ClassifierError`. */
const UNEXPECTED_AI_FAILURE_REASON =
  'AI gagal (kesalahan tak terduga); keluhan ditandai Perlu Ditinjau untuk ditangani manual.';

/**
 * Alasan fallback yang disimpan saat klasifikasi AI tidak tersedia/gagal.
 * Keluhan tetap dicatat sebagai `perlu_ditinjau` agar bisa ditangani manual.
 */
function buildFallbackReason(err: ClassifierError): string {
  if (err.code === 'NOT_CONFIGURED') {
    return 'AI belum dikonfigurasi; keluhan ditandai Perlu Ditinjau untuk ditangani manual.';
  }

  if (err.code === 'INVALID_OUTPUT') {
    return 'Hasil AI tidak valid; keluhan ditandai Perlu Ditinjau untuk ditangani manual.';
  }

  const detail = err.status
    ? `HTTP ${err.status}`
    : typeof err.latencyMs === 'number'
      ? `timeout ${err.latencyMs} ms`
      : 'tanpa status HTTP';
  return `Layanan AI gagal (${detail}); keluhan ditandai Perlu Ditinjau untuk ditangani manual.`;
}

/** Ringkas error tak terduga untuk log, tanpa pernah mencetak API key. */
function describeUnexpectedError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const apiKey = process.env.AI_API_KEY?.trim();
  return apiKey ? raw.split(apiKey).join('[REDACTED]') : raw;
}

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const validation = validateComplaintInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { rawText, roomNumber, guestName } = validation.value;
    const channel = (body as Record<string, unknown>).channel;

    if (!CHANNELS.includes(channel as Channel)) {
      return NextResponse.json(
        { error: 'Kanal tidak valid. Gunakan front_desk, qr, phone, whatsapp, email, atau other.' },
        { status: 400 }
      );
    }

    // Klasifikasi AI bersifat best-effort: apa pun kegagalannya, keluhan tetap
    // disimpan sebagai Perlu Ditinjau (manual). Permintaan tidak pernah gagal
    // hanya karena AI bermasalah.
    let classification: ClassificationResult;
    let failureNote: string | null = null;
    try {
      classification = await classifyComplaint(rawText);
    } catch (err) {
      if (err instanceof ClassifierError) {
        failureNote = err.code;
        classification = {
          category: 'perlu_ditinjau',
          confidence: 0,
          reason: buildFallbackReason(err),
        };
      } else {
        failureNote = 'kesalahan tak terduga';
        console.error(
          `[keluhan] Klasifikasi AI gagal (${failureNote}): ${describeUnexpectedError(err)}`
        );
        classification = {
          category: 'perlu_ditinjau',
          confidence: 0,
          reason: UNEXPECTED_AI_FAILURE_REASON,
        };
      }
    }

    const complaint = await dbService.createComplaint({
      guest_name: guestName,
      room_number: roomNumber,
      channel: channel as Channel,
      raw_text: rawText,
      ai_category: classification.category,
      ai_confidence: classification.confidence,
      ai_reason: classification.reason,
      ai_response_raw: {
        kategori: classification.category,
        confidence: classification.confidence,
        alasan: classification.reason,
      },
      created_by: user.id,
      actor: user.full_name,
    });

    if (failureNote) {
      console.warn(
        `[keluhan] Klasifikasi AI gagal (${failureNote}); keluhan ${complaint.id} disimpan sebagai Perlu Ditinjau untuk ditangani manual.`
      );
    }

    // Notifikasi ke departemen terkait bersifat best-effort dan dijadwalkan
    // setelah respons, sehingga tidak pernah menahan 201. Data seed tidak
    // melewati route ini, jadi tidak ada notifikasi untuk data demo.
    if (complaint.department) {
      const department = complaint.department;
      after(async () => {
        try {
          await notifyDepartment({
            department,
            complaintId: complaint.id,
            roomNumber: complaint.room_number ?? roomNumber,
            categoryLabel: categoryLabel(complaint.category ?? complaint.ai_category),
            rawText,
          });
        } catch (notifyErr) {
          console.error('Notifikasi keluhan gagal (diabaikan):', notifyErr);
        }
      });
    }

    return NextResponse.json({ complaint }, { status: 201 });
  } catch (err) {
    console.error('API catat keluhan gagal:', err);
    return NextResponse.json({ error: 'Gagal mencatat keluhan.' }, { status: 500 });
  }
}
