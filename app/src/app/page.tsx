'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CATEGORIES,
  CATEGORY_LABELS,
  CHANNELS,
  CHANNEL_LABELS,
  COMPLAINT_STATUSES,
  DEPARTMENT_LABELS,
  STATUS_LABELS,
  categoryLabel,
  channelLabel,
  departmentLabel,
  statusLabel,
  type ActivityLog,
  type CategoryCode,
  type Channel,
  type Complaint,
  type ComplaintAnalysis,
  type ComplaintStatus,
} from '@/lib/types';
import { CATEGORY_TO_DEPARTMENT, canTransition } from '@/lib/workflow';
import { apiFetch } from '@/lib/client';

type Tab = 'dashboard' | 'submit' | 'complaints';

interface ComplaintDetails {
  complaint: Complaint;
  analysis?: ComplaintAnalysis;
  logs: ActivityLog[];
}

const STATUS_BADGE: Record<ComplaintStatus, string> = {
  baru: 'badge-neutral',
  diproses: 'badge-warn',
  selesai: 'badge-accent',
};

const CATEGORY_COLORS: Record<CategoryCode, string> = {
  kebersihan: '#145C4C',
  teknisi: '#145C4C',
  fnb: '#145C4C',
  resepsionis: '#145C4C',
  perlu_ditinjau: '#4B5563',
};

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  baru: '#A8A29A',
  diproses: '#8A5A2B',
  selesai: '#145C4C',
};

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E3DED4',
  borderRadius: 4,
  boxShadow: 'none',
  fontSize: 12,
};

const TOOLTIP_ITEM_STYLE = { color: '#1B1A17', fontSize: 12 };
const TOOLTIP_LABEL_STYLE = { color: '#6A655C', fontSize: 11 };

const ACTIVITY_LABELS: Record<string, string> = {
  keluhan_dicatat: 'Keluhan dicatat',
  verifikasi_terima: 'Rekomendasi diterima',
  verifikasi_ubah: 'Kategori diubah',
  status_diubah: 'Status diubah',
};

function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function confidencePercent(value?: number): string {
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

function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status]}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

/** Penanda netral untuk keluhan yang dicatat tamu lewat QR tanpa sesi petugas. */
function GuestBadge() {
  return <span className="badge badge-neutral">Tamu</span>;
}

// ---------------------------------------------------------------------------
// Panel kategori (dipakai di panel rekomendasi dan panel detail)
// ---------------------------------------------------------------------------

function VerificationPanel({
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
              <div
                aria-readonly="true"
                className="field field-readonly mt-1.5 w-full"
              >
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

function StatusControl({
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
            className={`btn btn-xs ${
              isCurrent
                ? 'btn-current'
                : 'btn-quiet'
            }`}
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
// Halaman utama
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ComplaintDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);

  const [form, setForm] = useState({
    text: '',
    guest: '',
    room: '',
    channel: 'front_desk' as Channel,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Complaint | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ComplaintStatus>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'unverified' | CategoryCode>('all');

  const fetchComplaints = async () => {
    const result = await apiFetch<{ complaints: Complaint[] }>('/api/complaints', {
      cache: 'no-store',
    });

    if (result.ok) {
      setComplaints(result.data?.complaints || []);
    } else if (result.status !== 401) {
      setNotice({ type: 'err', text: result.error || 'Gagal memuat daftar keluhan.' });
    }

    setLoading(false);
  };

  const openDetails = async (id: string) => {
    setSelectedId(id);
    setLoadingDetails(true);
    setDetails(null);
    setDetailsError(null);

    const result = await apiFetch<ComplaintDetails>(`/api/complaints/${id}`, {
      cache: 'no-store',
    });

    if (result.ok && result.data) {
      setDetails(result.data);
    } else if (result.status !== 401) {
      setDetailsError(result.error || 'Gagal memuat detail');
    }

    setLoadingDetails(false);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user) {
      fetchComplaints();
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    apiFetch<{ configured: boolean; model: string }>(
      '/api/ai-status',
      { cache: 'no-store' }
    ).then((result) => {
      if (result.ok && result.data) setAiStatus(result.data);
    });
  }, []);

  const showError = (message: string) => {
    setNotice({ type: 'err', text: message });
    window.setTimeout(() => setNotice((current) => (current?.text === message ? null : current)), 4000);
  };

  const handleUpdated = (updated: Complaint) => {
    setComplaints((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    setSubmission((previous) => (previous && previous.id === updated.id ? updated : previous));
    setDetails((previous) =>
      previous && previous.complaint.id === updated.id ? { ...previous, complaint: updated } : previous
    );
    setNotice({ type: 'ok', text: 'Keluhan berhasil diperbarui.' });
    window.setTimeout(() => setNotice(null), 3000);
    if (details?.complaint.id === updated.id) {
      // Muat ulang jejak aktivitas setelah koreksi/pindah status.
      apiFetch<ComplaintDetails>(`/api/complaints/${updated.id}`, { cache: 'no-store' }).then(
        (result) => {
          if (result.ok && result.data) setDetails(result.data);
        }
      );
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.text.trim()) {
      setSubmitError('Teks keluhan wajib diisi.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmission(null);

    try {
      const result = await apiFetch<{ complaint: Complaint }>('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: form.text.trim(),
          guest_name: form.guest.trim() || undefined,
          room_number: form.room.trim() || undefined,
          channel: form.channel,
        }),
      });

      if (!result.ok || !result.data?.complaint) {
        setSubmitError(result.error || 'Gagal mencatat keluhan.');
        return;
      }

      setSubmission(result.data.complaint);
      setForm({ text: '', guest: '', room: '', channel: form.channel });
      fetchComplaints();
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--paper)]">
        <p className="text-sm text-[var(--ink-muted)]">Memeriksa sesi petugas...</p>
      </div>
    );
  }

  const aiUnavailable = aiStatus !== null && !aiStatus.configured;

  // ---------------------------------------------------------------------
  // Turunan data dasbor
  // ---------------------------------------------------------------------
  const total = complaints.length;
  const countByStatus = (status: ComplaintStatus) => complaints.filter((item) => item.status === status).length;
  // Samakan dengan grafik kategori: yang dihitung adalah kategori final,
  // bukan rekomendasi AI.
  const perluDitinjau = complaints.filter((item) => item.category === 'perlu_ditinjau').length;
  // Keluhan tanpa kategori petugas tidak masuk grafik kategori; jumlahnya
  // ditampilkan sebagai keterangan kecil di bawah judul grafik.
  const belumDiverifikasi = complaints.filter((item) => !item.category).length;

  const categoryChartData = CATEGORIES.map((code) => ({
    name: CATEGORY_LABELS[code],
    value: complaints.filter((item) => item.category === code).length,
    color: CATEGORY_COLORS[code],
  }));

  const statusChartData = COMPLAINT_STATUSES.map((status) => ({
    name: STATUS_LABELS[status],
    value: countByStatus(status),
    color: STATUS_COLORS[status],
  }));

  const activeCount = countByStatus('baru') + countByStatus('diproses');
  const latestComplaints = complaints.slice(0, 5);

  const filteredComplaints = complaints.filter((item) => {
    const needle = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      item.raw_text.toLowerCase().includes(needle) ||
      (item.guest_name ? item.guest_name.toLowerCase().includes(needle) : false) ||
      (item.room_number ? item.room_number.toLowerCase().includes(needle) : false);

    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    const matchesCategory =
      filterCategory === 'all'
        ? true
        : filterCategory === 'unverified'
          ? !item.category
          : item.category === filterCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const summaryItems = [
    { label: 'Total', value: total },
    { label: 'Baru', value: countByStatus('baru') },
    { label: 'Diproses', value: countByStatus('diproses') },
    { label: 'Selesai', value: countByStatus('selesai') },
    { label: 'Kategori Perlu Ditinjau', value: perluDitinjau },
  ];

  return (
    <div className="min-h-screen w-full bg-[var(--paper)] text-[var(--ink)] lg:flex">
      {/* SIDEBAR */}
      <aside className="flex w-full shrink-0 select-none flex-col justify-between border-b border-[var(--line)] lg:w-60 lg:border-b-0 lg:border-r">
        <div>
          <div className="border-b border-[var(--line)] px-5 py-5">
            <p className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">SmartGuest</p>
            <p className="eyebrow mt-1">Operasional Hotel</p>
          </div>

          <nav className="flex flex-wrap gap-1 px-3 py-3 lg:block lg:space-y-0.5 lg:px-4 lg:py-4">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedId(null);
              }}
              className={`flex w-auto items-center gap-2.5 border-l-2 px-3 py-2 text-left text-[13px] lg:w-full ${
                activeTab === 'dashboard'
                  ? 'border-l-[var(--accent)] font-semibold text-[var(--ink)]'
                  : 'border-l-transparent font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <LayoutDashboard size={16} strokeWidth={1.5} />
              <span>Dasbor</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('submit');
                setSelectedId(null);
              }}
              className={`flex w-auto items-center gap-2.5 border-l-2 px-3 py-2 text-left text-[13px] lg:w-full ${
                activeTab === 'submit'
                  ? 'border-l-[var(--accent)] font-semibold text-[var(--ink)]'
                  : 'border-l-transparent font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <PlusCircle size={16} strokeWidth={1.5} />
              <span>Catat Keluhan</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('complaints');
                setSelectedId(null);
              }}
              className={`flex w-auto items-center gap-2.5 border-l-2 px-3 py-2 text-left text-[13px] lg:w-full ${
                activeTab === 'complaints'
                  ? 'border-l-[var(--accent)] font-semibold text-[var(--ink)]'
                  : 'border-l-transparent font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <ClipboardList size={16} strokeWidth={1.5} />
              <span>Daftar Keluhan</span>
              {activeCount > 0 && (
                <span className="ml-auto text-[11px] font-medium tabular-nums text-[var(--ink-muted)]">
                  {activeCount}
                </span>
              )}
            </button>

            <Link
              href="/qr"
              className="flex w-auto items-center gap-2.5 border-l-2 border-l-transparent px-3 py-2 text-left text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] lg:w-full"
            >
              <QrCode size={16} strokeWidth={1.5} />
              <span>QR Kamar</span>
            </Link>
          </nav>
        </div>

        <div className="border-t border-[var(--line)] px-4 py-4">
          <div className="mb-3 px-1">
            <p className="truncate text-[13px] font-medium text-[var(--ink)]">{user.full_name}</p>
            <p className="eyebrow mt-0.5">Petugas</p>
          </div>

          <button onClick={logout} className="btn btn-secondary btn-xs btn-block">
            <LogOut size={16} strokeWidth={1.5} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* KONTEN UTAMA */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-3 lg:px-8">
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">
            {activeTab === 'dashboard' && 'Dasbor Keluhan'}
            {activeTab === 'submit' && 'Catat Keluhan'}
            {activeTab === 'complaints' && 'Daftar Keluhan'}
          </h1>

          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-[var(--ink-muted)]">
            {aiStatus &&
              (aiStatus.configured ? (
                <span
                  className="flex items-center gap-1.5"
                  title="Klasifikasi memakai LLM"
                >
                  <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
                  AI aktif ({aiStatus.model})
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="dot" style={{ background: 'var(--warn)' }} aria-hidden="true" />
                  AI tidak aktif
                </span>
              ))}
            <span className="hidden h-3 w-px bg-[var(--line)] sm:block" />
            <span className="flex items-center gap-1.5">
              <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
              Sesi petugas aktif
            </span>
          </div>
        </header>

        {notice && (
          <div
            className={`mx-6 mt-4 rounded-[4px] border bg-[var(--surface)] px-4 py-2 text-xs font-medium lg:mx-8 ${
              notice.type === 'ok'
                ? 'border-[var(--line)] text-[var(--accent)]'
                : 'border-[var(--danger)] text-[var(--danger)]'
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
          {/* ============================ DASBOR ============================ */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <section className="flex divide-x divide-[var(--line)] overflow-x-auto">
                {summaryItems.map((item, index) => (
                  <div
                    key={item.label}
                    className={`min-w-[160px] flex-1 py-1 ${
                      index === 0 ? 'pr-6' : index === summaryItems.length - 1 ? 'pl-6' : 'px-6'
                    }`}
                  >
                    <p className="eyebrow">{item.label}</p>
                    <p className="metric mt-2">{item.value}</p>
                  </div>
                ))}
              </section>

              <div className="grid gap-8 lg:grid-cols-2">
                <section className="border-t border-[var(--line)] pt-5">
                  <h2 className="eyebrow">Rekap per Kategori</h2>
                  <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                    {belumDiverifikasi} keluhan belum diverifikasi
                  </p>
                  <div className="mt-3 h-60 min-w-0">
                    {total === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-[var(--ink-muted)]">
                        Belum ada data keluhan
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData} layout="vertical" margin={{ left: 0, right: 12 }}>
                          <CartesianGrid stroke="#EFEBE4" horizontal={false} />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fill: '#6A655C', fontSize: 11 }}
                            axisLine={{ stroke: '#E3DED4' }}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={128}
                            tick={{ fill: '#6A655C', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={TOOLTIP_CONTENT_STYLE}
                            itemStyle={TOOLTIP_ITEM_STYLE}
                            labelStyle={TOOLTIP_LABEL_STYLE}
                            cursor={{ fill: '#FBFAF7' }}
                          />
                          <Bar dataKey="value" name="Jumlah" isAnimationActive={false}>
                            {categoryChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </section>

                <section className="border-t border-[var(--line)] pt-5">
                  <h2 className="eyebrow">Rekap per Status</h2>
                  <div className="mt-4 h-60 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusChartData} margin={{ left: 0, right: 12 }}>
                        <CartesianGrid stroke="#EFEBE4" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#6A655C', fontSize: 11 }}
                          axisLine={{ stroke: '#E3DED4' }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: '#6A655C', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                          itemStyle={TOOLTIP_ITEM_STYLE}
                          labelStyle={TOOLTIP_LABEL_STYLE}
                          cursor={{ fill: '#FBFAF7' }}
                        />
                        <Bar dataKey="value" name="Jumlah" isAnimationActive={false}>
                          {statusChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <section className="border-t border-[var(--line)] pt-5">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="eyebrow">5 Keluhan Terbaru</h2>
                  <button
                    onClick={() => setActiveTab('complaints')}
                    className="flex items-center gap-1 text-[12px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    <span>Lihat semua</span>
                    <ChevronRight size={16} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="panel overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Kamar</th>
                          <th>Kanal</th>
                          <th>Keluhan</th>
                          <th>Kategori</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={5} className="table-state">
                              Memuat...
                            </td>
                          </tr>
                        ) : latestComplaints.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="table-state">
                              Belum ada keluhan tercatat
                            </td>
                          </tr>
                        ) : (
                          latestComplaints.map((item) => (
                            <tr key={item.id} onClick={() => openDetails(item.id)}>
                              <td className="font-medium tabular-nums text-[var(--ink)]">
                                {item.room_number || '-'}
                              </td>
                              <td className="text-[var(--ink-muted)]">
                                <span className="inline-flex items-center gap-1.5">
                                  {channelLabel(item.channel)}
                                  {item.created_by === 'guest' && <GuestBadge />}
                                </span>
                              </td>
                              <td className="max-w-[320px] truncate text-[var(--ink-muted)]">
                                {item.raw_text}
                              </td>
                              <td className="text-[var(--ink)]">
                                {categoryLabel(item.category)}
                                {item.department ? ` · ${departmentLabel(item.department)}` : ''}
                              </td>
                              <td>
                                <StatusBadge status={item.status} />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ============================ CATAT KELUHAN ============================ */}
          {activeTab === 'submit' && (
            <div className="mx-auto max-w-3xl space-y-8">
              <section className="panel p-6">
                <h2 className="text-base font-semibold text-[var(--ink)]">Catat Keluhan Tamu</h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                  Tulis keluhan apa adanya. Sistem mengisi kategori dan departemen secara otomatis;
                  petugas dapat mengoreksi bila perlu.
                </p>

                {aiUnavailable && (
                  <div className="mt-4 rounded-[4px] border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                    AI sedang tidak aktif. Keluhan tetap disimpan dan ditandai Perlu Ditinjau.
                  </div>
                )}

                {submitError && (
                  <p className="mt-4 rounded-[4px] border border-[var(--danger)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
                    {submitError}
                  </p>
                )}

                <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="eyebrow">Nama Tamu (opsional)</span>
                      <input
                        type="text"
                        value={form.guest}
                        onChange={(event) => setForm((current) => ({ ...current, guest: event.target.value }))}
                        placeholder="Contoh: Budi Santoso"
                        className="field mt-1.5 w-full"
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow">Nomor Kamar (opsional)</span>
                      <input
                        type="text"
                        value={form.room}
                        onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
                        placeholder="Contoh: 302"
                        className="field mt-1.5 w-full"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="eyebrow">Kanal</span>
                    <select
                      value={form.channel}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, channel: event.target.value as Channel }))
                      }
                      className="field mt-1.5 w-full"
                    >
                      {CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {CHANNEL_LABELS[channel]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="eyebrow">Teks Keluhan *</span>
                    <textarea
                      value={form.text}
                      onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
                      rows={5}
                      required
                      placeholder="Contoh: AC kamar tidak dingin, saya sudah lapor tapi belum ditindaklanjuti."
                      className="field mt-1.5 w-full resize-none"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary btn-block"
                  >
                    {submitting ? 'Mengklasifikasikan...' : 'Simpan & Klasifikasikan'}
                  </button>
                </form>
              </section>

              {submission && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-[var(--accent)]">
                    Keluhan tersimpan dengan status {statusLabel(submission.status)}.
                  </p>

                  <VerificationPanel
                    key={`${submission.id}-${submission.category ?? 'baru'}`}
                    complaint={submission}
                    onUpdated={handleUpdated}
                  />

                  <button
                    onClick={() => {
                      setSubmission(null);
                      setActiveTab('complaints');
                    }}
                    className="btn btn-secondary btn-block"
                  >
                    Buka Daftar Keluhan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================ DAFTAR KELUHAN ============================ */}
          {activeTab === 'complaints' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-[var(--line)] pb-4">
                <div className="relative w-full min-w-0 max-w-xs">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--ink-muted)]">
                    <Search size={16} strokeWidth={1.5} />
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari kamar, tamu, atau isi keluhan..."
                    className="field field-search w-full"
                  />
                </div>

                <div className="flex min-w-0 flex-wrap items-end gap-4">
                  <label className="flex flex-col">
                    <span className="eyebrow">Status</span>
                    <select
                      value={filterStatus}
                      onChange={(event) => setFilterStatus(event.target.value as 'all' | ComplaintStatus)}
                      className="field field-filter mt-1.5"
                    >
                      <option value="all">Semua</option>
                      {COMPLAINT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col">
                    <span className="eyebrow">Kategori</span>
                    <select
                      value={filterCategory}
                      onChange={(event) =>
                        setFilterCategory(event.target.value as 'all' | 'unverified' | CategoryCode)
                      }
                      className="field field-filter mt-1.5"
                    >
                      <option value="all">Semua</option>
                      {CATEGORIES.map((code) => (
                        <option key={code} value={code}>
                          {CATEGORY_LABELS[code]}
                        </option>
                      ))}
                      <option value="unverified">Belum diverifikasi</option>
                    </select>
                  </label>

                  {(searchTerm || filterStatus !== 'all' || filterCategory !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setFilterStatus('all');
                        setFilterCategory('all');
                      }}
                      className="btn btn-secondary btn-xs"
                    >
                      Atur ulang
                    </button>
                  )}
                </div>
              </div>

              <div className="panel overflow-hidden">
                {loading ? (
                  <div className="py-24 text-center text-xs text-[var(--ink-muted)]">Memuat...</div>
                ) : filteredComplaints.length === 0 ? (
                  <div className="py-24 text-center">
                    <p className="text-sm font-medium text-[var(--ink-muted)]">
                      Tidak ada keluhan yang cocok dengan filter
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-16rem)] overflow-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Kamar</th>
                          <th>Tamu &amp; Kanal</th>
                          <th>Keluhan</th>
                          <th>Kategori</th>
                          <th>Departemen</th>
                          <th>Status</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredComplaints.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => openDetails(item.id)}
                            data-selected={selectedId === item.id ? 'true' : undefined}
                          >
                            <td className="font-medium tabular-nums text-[var(--ink)] whitespace-nowrap">
                              {item.room_number || '-'}
                            </td>
                            <td>
                              <p className="max-w-[140px] truncate text-[13px] font-medium text-[var(--ink)]">
                                {item.guest_name || 'Tamu'}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-muted)]">
                                <span>{channelLabel(item.channel)}</span>
                                {item.created_by === 'guest' && <GuestBadge />}
                              </p>
                            </td>
                            <td>
                              <p className="max-w-[160px] truncate text-[var(--ink-muted)]">{item.raw_text}</p>
                            </td>
                            <td className="whitespace-nowrap">
                              {item.category ? (
                                <span className="text-[13px] font-medium text-[var(--ink)]">
                                  {categoryLabel(item.category)}
                                </span>
                              ) : (
                                <span className="text-[13px] font-medium text-[var(--warn)]">
                                  Belum diverifikasi
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap text-[var(--ink-muted)]">
                              {departmentLabel(item.department)}
                            </td>
                            <td>
                              <StatusBadge status={item.status} />
                            </td>
                            <td>
                              <StatusControl complaint={item} onUpdated={handleUpdated} onError={showError} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* PANEL DETAIL */}
      {selectedId && (
        <aside className="motion-fade fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(27,26,23,0.04)] lg:static lg:z-auto lg:w-[26rem] lg:max-w-none lg:shrink-0">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h3 className="eyebrow">Detail Keluhan</h3>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                Nomor: {details?.complaint.id.slice(0, 8) || selectedId.slice(0, 8)}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedId(null);
                setDetails(null);
              }}
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
              <button
                onClick={() => {
                  setSelectedId(null);
                  setDetails(null);
                  setDetailsError(null);
                }}
                className="btn btn-secondary btn-xs mt-2"
              >
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
                onUpdated={handleUpdated}
              />

              <div className="border-t border-[var(--line)] pt-4">
                <h4 className="eyebrow">Ubah Status</h4>
                <div className="mt-3">
                  <StatusControl complaint={details.complaint} onUpdated={handleUpdated} onError={showError} />
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
      )}
    </div>
  );
}
