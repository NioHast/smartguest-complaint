// Endpoint publik untuk tamu: mencatat keluhan dari form QR tanpa sesi.
//
// Berbeda dengan `/api/complaints` (internal, wajib sesi), jalur ini sengaja
// terbuka. Kegagalan klasifikasi AI apa pun tidak menggagalkan permintaan:
// keluhan tetap disimpan dengan `ai_category = perlu_ditinjau` agar tidak ada
// laporan tamu yang hilang.

import { NextResponse, after } from 'next/server';

import { ClassifierError, classifyComplaint, type ClassificationResult } from '@/lib/ai';
import { createComplaint } from '@/lib/db';
import { notifyDepartment } from '@/lib/notifier';
import { categoryLabel } from '@/lib/types';
import { validateComplaintInput } from '@/lib/validation';

/** Alasan generik untuk kegagalan AI di luar `ClassifierError`. */
const UNEXPECTED_AI_FAILURE_REASON =
  'AI gagal (kesalahan tak terduga); keluhan ditandai Perlu Ditinjau untuk ditangani manual.';

/** Alasan yang disimpan saat AI gagal; selalu menyebut penyebabnya. */
function aiFailureReason(err: ClassifierError): string {
  if (err.code === 'NOT_CONFIGURED') {
    return 'AI belum dikonfigurasi.';
  }
  if (err.code === 'INVALID_OUTPUT') {
    return 'AI gagal: hasil klasifikasi tidak valid.';
  }
  const detail =
    err.status !== undefined
      ? `HTTP ${err.status}`
      : err.latencyMs !== undefined
        ? `timeout setelah ${err.latencyMs} ms`
        : 'tanpa status HTTP';
  return `AI gagal: ${detail}.`;
}

/** Ringkas error tak terduga untuk log, tanpa pernah mencetak API key. */
function describeUnexpectedError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const apiKey = process.env.AI_API_KEY?.trim();
  return apiKey ? raw.split(apiKey).join('[REDACTED]') : raw;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  // Jalur publik menolak guest_name non-string (bukan mengabaikannya), dan
  // memakai aturan panjang/pola yang sama dengan jalur petugas.
  const validation = validateComplaintInput(body, { rejectNonStringGuestName: true });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { rawText, roomNumber, guestName } = validation.value;

  // Klasifikasi AI bersifat best-effort di jalur publik: apa pun kegagalannya,
  // keluhan tetap dicatat dan diteruskan ke Duty Manager untuk ditinjau.
  let classification: ClassificationResult;
  let aiFailure: string | null = null;
  try {
    classification = await classifyComplaint(rawText);
  } catch (err) {
    if (err instanceof ClassifierError) {
      aiFailure = aiFailureReason(err);
    } else {
      aiFailure = UNEXPECTED_AI_FAILURE_REASON;
      console.error(`[keluhan publik] Klasifikasi AI gagal (kesalahan tak terduga): ${describeUnexpectedError(err)}`);
    }
    classification = {
      category: 'perlu_ditinjau',
      confidence: 0,
      reason: aiFailure,
    };
  }

  try {
    const complaint = await createComplaint({
      guest_name: guestName,
      room_number: roomNumber,
      channel: 'qr',
      raw_text: rawText,
      ai_category: classification.category,
      ai_confidence: classification.confidence,
      ai_reason: classification.reason,
      ai_response_raw: {
        kategori: classification.category,
        confidence: classification.confidence,
        alasan: classification.reason,
        gagal: aiFailure !== null,
      },
      created_by: 'guest',
      actor: 'Tamu',
    });

    if (aiFailure) {
      console.warn(
        `[keluhan publik] Klasifikasi AI gagal; keluhan ${complaint.id} disimpan sebagai Perlu Ditinjau untuk ditangani manual.`
      );
    }

    // Notifikasi ke departemen terkait bersifat best-effort dan dijadwalkan
    // setelah respons, sehingga tidak pernah menahan 201.
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
          console.error('Notifikasi keluhan publik gagal (diabaikan):', notifyErr);
        }
      });
    }

    // Respons publik minimal: tamu hanya membutuhkan id untuk nomor referensi.
    return NextResponse.json(
      { id: complaint.id, status: complaint.status },
      { status: 201 }
    );
  } catch (err) {
    console.error('API catat keluhan publik gagal:', err);
    return NextResponse.json({ error: 'Gagal mencatat keluhan.' }, { status: 500 });
  }
}
