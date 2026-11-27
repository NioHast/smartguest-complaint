'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

import { apiFetch } from '@/lib/client';
import { useComplaints } from '@/lib/use-complaints';
import { GuestBadge } from '@/components/complaint-badges';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  DEPARTMENT_LABELS,
  STATUS_LABELS,
  categoryLabel,
  channelLabel,
  departmentLabel,
} from '@/lib/types';
import type { CategoryCode, Complaint, ComplaintStatus } from '@/lib/types';
import { CATEGORY_TO_DEPARTMENT, canTransition } from '@/lib/workflow';

const ACTIVITY_LABELS: Record<string, string> = {
  keluhan_dicatat: 'Keluhan dicatat',
  verifikasi_terima: 'Rekomendasi diterima',
  verifikasi_ubah: 'Kategori diubah',
  status_diubah: 'Status diubah',
};

export function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function confidencePercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

async function patchComplaint(
  id: string,
  payload: Record<string, unknown>
): Promise<{ complaint?: Complaint; error?: string }> {
  const result = await apiFetch<{ complaint?: Complaint }>(`/api/complaints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!result.ok || !result.data?.complaint) {
    return { error: result.error || 'Gagal memperbarui keluhan.' };
  }
  return { complaint: result.data.complaint };
}

// ---------------------------------------------------------------------------
// Panel kategori (dipakai di panel rekomendasi dan panel detail)
// ---------------------------------------------------------------------------

export function VerificationPanel({
  complaint,
  onUpdated,
}: {
  complaint: Complaint;
  onUpdated: (complaint: Complaint) => void;
}) {
  const [showChange, setShowChange] = useState(false);
  const initialCategory: CategoryCode =
    complaint.category ?? complaint.ai_category ?? 'perlu_ditinjau';
  const [category, setCategory] = useState<CategoryCode>(initialCategory);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isFinalized = complaint.status === 'selesai';

  const handleChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setError('Alasan perubahan wajib diisi minimal 10 karakter.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await patchComplaint(complaint.id, {
      action: 'change',
      category,
      reason: reason.trim(),
    });
    setBusy(false);

    if (result.error || !result.complaint) {
      setError(result.error || 'Gagal mengubah kategori.');
      return;
    }

    setShowChange(false);
    setReason('');
    onUpdated(result.complaint);
  };

  return (
    <section className="rounded-[10px] border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--surface)] p-5">
      <h3 className="eyebrow">Rekomendasi AI</h3>

      <dl className="mt-3 divide-y divide-[var(--line)]">
        <div className="detail-row py-2">
          <dt className="detail-label">Kategori</dt>
          <dd className="text-[13px] font-medium text-[var(--ink)]">
            {categoryLabel(complaint.ai_category)}
          </dd>
        </div>
        <div className="detail-row py-2">
          <dt className="detail-label">Departemen</dt>
          <dd className="text-[13px] font-medium text-[var(--ink)]">
            {departmentLabel(complaint.department)}
          </dd>
        </div>
        <div className="detail-row py-2">
          <dt className="detail-label">Keyakinan</dt>
          <dd className="text-[13px] font-medium tabular-nums text-[var(--ink)]">
            {confidencePercent(complaint.ai_confidence)}
          </dd>
        </div>
        <div className="detail-row py-2">
          <dt className="detail-label">Alasan klasifikasi</dt>
          <dd className="text-[13px] leading-relaxed text-[var(--ink)]">
            {complaint.ai_reason || '-'}
          </dd>
        </div>
      </dl>

      {complaint.category && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <p className="eyebrow">Kategori terpilih</p>
          <p className="mt-2 text-[13px] font-medium text-[var(--ink)]">
            {categoryLabel(complaint.category)} → {departmentLabel(complaint.department)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-muted)]">
            Kategori terisi otomatis. Koreksi bila perlu.
          </p>
          {complaint.verified_by && (
            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
              Ditangani oleh {complaint.verified_by} · {formatDateTime(complaint.verified_at)}
            </p>
          )}
          {complaint.change_reason && (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              Alasan perubahan: {complaint.change_reason}
            </p>
          )}
        </div>
      )}

      {!isFinalized && (
        <button
          onClick={() => setShowChange((value) => !value)}
          disabled={busy}
          className={`btn btn-block mt-3 ${complaint.category ? 'btn-secondary' : 'btn-primary'}`}
        >
          Koreksi kategori
        </button>
      )}

      {showChange && !isFinalized && (
        <form onSubmit={handleChange} className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow">Kategori</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as CategoryCode)}
                className="field mt-1.5 w-full"
              >
                {CATEGORIES.map((code) => (
                  <option key={code} value={code}>
                    {CATEGORY_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="eyebrow">Departemen (otomatis)</span>
              <div aria-readonly="true" className="field field-readonly mt-1.5 w-full">
                {DEPARTMENT_LABELS[CATEGORY_TO_DEPARTMENT[category]]}
              </div>
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Alasan perubahan (min. 10 karakter)</span>
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError(null);
              }}
              rows={2}
              placeholder="Contoh: tamu menyebut masalah antrean check-in, bukan kebersihan."
              className="field mt-1.5 w-full resize-none"
            />
            <span className="mt-1 block text-[11px] text-[var(--ink-muted)]">
              {reason.trim().length}/10 karakter
            </span>
          </label>

          <button type="submit" disabled={busy} className="btn btn-primary btn-block">
            {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-[11px] font-medium text-[var(--danger)]">{error}</p>}
    </section>
  );
}

export function StatusControl({
  complaint,
  onUpdated,
  onError,
}: {
  complaint: Complaint;
  onUpdated: (complaint: Complaint) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<ComplaintStatus | null>(null);

  const changeStatus = async (status: ComplaintStatus) => {
    if (status === complaint.status) return;
    setBusy(status);
    const result = await patchComplaint(complaint.id, { action: 'status', status });
    setBusy(null);

    if (result.error || !result.complaint) {
      onError(result.error || 'Gagal mengubah status.');
      return;
    }

    onUpdated(result.complaint);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COMPLAINT_STATUSES.map((status) => {
        const isCurrent = status === complaint.status;
        const isAllowed = canTransition(complaint.status, status);
        return (
          <button
            key={status}
            onClick={(event) => {
              event.stopPropagation();
              changeStatus(status);
            }}
            disabled={isCurrent || !isAllowed || busy !== null}
            className={`btn btn-xs ${isCurrent ? 'btn-current' : 'btn-quiet'}`}
            title={isCurrent ? 'Status saat ini' : `Ubah ke ${STATUS_LABELS[status]}`}
          >
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer detail
// ---------------------------------------------------------------------------

export default function ComplaintDetail() {
  const {
    selectedId,
    details,
    loadingDetails,
    detailsError,
    closeDetails,
    updateComplaint,
    showError,
  } = useComplaints();

  if (!selectedId) return null;

  return (
    <aside className="motion-fade fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(27,26,23,0.04)] lg:static lg:z-auto lg:w-[26rem] lg:max-w-none lg:shrink-0">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <h3 className="eyebrow">Detail Keluhan</h3>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            Nomor: {details?.complaint.id.slice(0, 8) || selectedId.slice(0, 8)}
          </p>
        </div>
        <button
          onClick={closeDetails}
          className="rounded-[4px] p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
          aria-label="Tutup detail"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {loadingDetails ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--ink-muted)]">
          Memuat detail...
        </div>
      ) : detailsError || !details ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-[var(--danger)]">Gagal memuat detail</p>
          <p className="text-xs text-[var(--ink-muted)]">
            {detailsError || 'Data detail tidak tersedia.'}
          </p>
          <button onClick={closeDetails} className="btn btn-secondary btn-xs mt-2">
            Tutup
          </button>
        </div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="border-b border-[var(--line)] pb-4">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-[var(--ink)]">
                {details.complaint.guest_name || 'Tamu'}
              </p>
              {details.complaint.created_by === 'guest' && <GuestBadge />}
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
              Kamar {details.complaint.room_number || '-'} · {channelLabel(details.complaint.channel)}
            </p>
          </div>

          <div>
            <span className="eyebrow">Teks keluhan</span>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]">
              &ldquo;{details.complaint.raw_text}&rdquo;
            </p>
            <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
              Dicatat {formatDateTime(details.complaint.created_at)}
            </p>
          </div>

          <VerificationPanel
            key={`${details.complaint.id}-${details.complaint.category ?? 'baru'}`}
            complaint={details.complaint}
            onUpdated={updateComplaint}
          />

          <div className="border-t border-[var(--line)] pt-4">
            <h4 className="eyebrow">Ubah Status</h4>
            <div className="mt-3">
              <StatusControl
                complaint={details.complaint}
                onUpdated={updateComplaint}
                onError={showError}
              />
            </div>
            {details.complaint.resolved_at && (
              <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
                Diselesaikan {formatDateTime(details.complaint.resolved_at)}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--line)] pt-4">
            <span className="eyebrow">Jejak aktivitas</span>
            <ol className="mt-2 divide-y divide-[var(--line)]">
              {details.logs.map((log) => (
                <li key={log.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      {ACTIVITY_LABELS[log.action] || log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--ink-muted)]">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink)]">{log.detail}</p>
                  {log.actor && (
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">Oleh: {log.actor}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </aside>
  );
}
