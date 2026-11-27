'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { VerificationPanel } from '@/components/complaint-detail';
import { apiFetch } from '@/lib/client';
import { useComplaints } from '@/lib/use-complaints';
import {
  CHANNELS,
  CHANNEL_LABELS,
  statusLabel,
  type Channel,
  type Complaint,
} from '@/lib/types';

export default function ComplaintForm() {
  const router = useRouter();
  const { aiStatus, refresh, updateComplaint } = useComplaints();

  const [form, setForm] = useState({
    text: '',
    guest: '',
    room: '',
    channel: 'front_desk' as Channel,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Complaint | null>(null);

  const aiUnavailable = aiStatus !== null && !aiStatus.configured;

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
      refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmissionUpdated = (updated: Complaint) => {
    setSubmission(updated);
    updateComplaint(updated);
  };

  return (
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

          <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
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
            onUpdated={handleSubmissionUpdated}
          />

          <button
            onClick={() => {
              setSubmission(null);
              router.push('/keluhan');
            }}
            className="btn btn-secondary btn-block"
          >
            Buka Daftar Keluhan
          </button>
        </div>
      )}
    </div>
  );
}
