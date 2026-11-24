import { NextResponse } from 'next/server';
import { dbService, StatusGuardError } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  DEPARTMENT_LABELS,
  STATUS_LABELS,
  type CategoryCode,
  type ComplaintStatus,
} from '@/lib/types';
import { CATEGORY_TO_DEPARTMENT, canTransition } from '@/lib/workflow';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const details = await dbService.getComplaintDetails(id);

    if (!details) {
      return NextResponse.json({ error: 'Keluhan tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (err) {
    console.error('API detail keluhan gagal:', err);
    return NextResponse.json({ error: 'Gagal memuat detail keluhan.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action;

    const complaint = await dbService.getComplaint(id);
    if (!complaint) {
      return NextResponse.json({ error: 'Keluhan tidak ditemukan.' }, { status: 404 });
    }

    // ---------------------------------------------------------------------
    // Terima rekomendasi AI
    // ---------------------------------------------------------------------
    if (action === 'accept') {
      if (complaint.status === 'selesai') {
        return NextResponse.json(
          { error: 'Keluhan yang sudah selesai tidak dapat diverifikasi ulang.' },
          { status: 400 }
        );
      }
      if (!complaint.ai_category) {
        return NextResponse.json(
          { error: 'Keluhan ini belum memiliki rekomendasi AI yang bisa diterima.' },
          { status: 400 }
        );
      }
      if (complaint.category) {
        return NextResponse.json(
          { error: 'Keluhan sudah diverifikasi. Gunakan aksi ubah bila perlu mengoreksi kategori.' },
          { status: 400 }
        );
      }

      const category = complaint.ai_category;
      const department = CATEGORY_TO_DEPARTMENT[category];

      const updated = await dbService.updateVerification(id, {
        category,
        department,
        actor: user.full_name,
        action: 'verifikasi_terima',
        detail: `Menerima rekomendasi AI: ${CATEGORY_LABELS[category]} → ${DEPARTMENT_LABELS[department]}.`,
      });

      return NextResponse.json({ complaint: updated });
    }

    // ---------------------------------------------------------------------
    // Ubah kategori + departemen (wajib alasan)
    // ---------------------------------------------------------------------
    if (action === 'change') {
      if (complaint.status === 'selesai') {
        return NextResponse.json(
          { error: 'Keluhan yang sudah selesai tidak dapat diubah kategorinya.' },
          { status: 400 }
        );
      }

      if (!CATEGORIES.includes(body.category)) {
        return NextResponse.json(
          { error: 'Kategori tidak valid. Pilih salah satu dari 5 kategori yang tersedia.' },
          { status: 400 }
        );
      }

      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 10) {
        return NextResponse.json(
          { error: 'Alasan perubahan wajib diisi minimal 10 karakter.' },
          { status: 400 }
        );
      }

      const category = body.category as CategoryCode;
      const expectedDepartment = CATEGORY_TO_DEPARTMENT[category];

      // Departemen selalu diturunkan dari kategori. Body boleh mengirimkan
      // departemen yang sama (kompatibilitas klien lama), tetapi nilai yang
      // berbeda ditolak agar kategori dan departemen tidak pernah bertentangan.
      if (
        body.department !== undefined &&
        body.department !== null &&
        body.department !== '' &&
        body.department !== expectedDepartment
      ) {
        return NextResponse.json(
          {
            error: `Departemen harus ${DEPARTMENT_LABELS[expectedDepartment]} untuk kategori ${CATEGORY_LABELS[category]}.`,
          },
          { status: 400 }
        );
      }

      const department = expectedDepartment;

      const previousCategory = complaint.category
        ? CATEGORY_LABELS[complaint.category]
        : 'Belum diverifikasi';

      const updated = await dbService.updateVerification(id, {
        category,
        department,
        actor: user.full_name,
        action: 'verifikasi_ubah',
        change_reason: reason,
        detail: `Mengubah kategori dari ${previousCategory} ke ${CATEGORY_LABELS[category]} (${DEPARTMENT_LABELS[department]}). Alasan: ${reason}`,
      });

      return NextResponse.json({ complaint: updated });
    }

    // ---------------------------------------------------------------------
    // Ubah status
    // ---------------------------------------------------------------------
    if (action === 'status') {
      if (!COMPLAINT_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: 'Status tidak valid. Gunakan baru, diproses, atau selesai.' },
          { status: 400 }
        );
      }

      const nextStatus = body.status as ComplaintStatus;

      if (nextStatus === complaint.status) {
        return NextResponse.json(
          { error: `Status keluhan sudah ${STATUS_LABELS[nextStatus]}.` },
          { status: 400 }
        );
      }

      if (!canTransition(complaint.status, nextStatus)) {
        return NextResponse.json(
          {
            error: `Transisi status dari ${STATUS_LABELS[complaint.status]} ke ${STATUS_LABELS[nextStatus]} tidak diizinkan.`,
          },
          { status: 400 }
        );
      }

      try {
        const updated = await dbService.updateStatus(id, nextStatus, user.full_name);
        return NextResponse.json({ complaint: updated });
      } catch (err) {
        if (err instanceof StatusGuardError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    return NextResponse.json(
      { error: "Aksi tidak dikenali. Gunakan 'accept', 'change', atau 'status'." },
      { status: 400 }
    );
  } catch (err) {
    console.error('API ubah keluhan gagal:', err);
    return NextResponse.json({ error: 'Gagal memperbarui keluhan.' }, { status: 500 });
  }
}
