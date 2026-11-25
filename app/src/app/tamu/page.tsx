'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { normalizeRoomNumber } from '@/lib/validation';

interface PublicComplaintResponse {
  id?: string;
  status?: string;
  error?: string;
}

function GuestComplaintForm() {
  const searchParams = useSearchParams();
  // Kamar yang tidak lolos pola server tidak dikirim dan tidak ditampilkan,
  // tetapi form tetap bisa digunakan.
  const roomNumber = normalizeRoomNumber(searchParams.get('kamar'));

  const [rawText, setRawText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = rawText.trim();
    if (!text) {
      setError('Teks keluhan wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/public/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: text,
          ...(roomNumber ? { room_number: roomNumber } : {}),
          ...(guestName.trim() ? { guest_name: guestName.trim() } : {}),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as PublicComplaintResponse;

      if (!response.ok) {
        setError(data.error || 'Keluhan gagal dikirim. Silakan coba lagi.');
        setSubmitting(false);
        return;
      }

      const id = data.id ?? '';
      setReference(id.slice(0, 8));
      setRawText('');
      setGuestName('');
      setSubmitting(false);
    } catch {
      setError('Koneksi gagal. Periksa jaringan Anda lalu coba lagi.');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="eyebrow">SmartGuest · Layanan Tamu</p>
          {roomNumber && (
            <p className="text-xs font-semibold tracking-wide text-[var(--ink)]">
              Kamar {roomNumber}
            </p>
          )}
        </div>

        <div className="panel p-6 sm:p-8">
          {reference !== null ? (
            <div aria-live="polite">
              <p className="eyebrow">Laporan Diterima</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--ink)]">
                Terima kasih.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
                Keluhan Anda sudah diterima. Petugas akan menindaklanjuti.
              </p>

              <div className="mt-6 rounded-[4px] border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
                <p className="eyebrow">Nomor Referensi</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-[var(--ink)]">
                  {reference || '—'}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-block mt-6"
                onClick={() => setReference(null)}
              >
                Kirim keluhan lain
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                Sampaikan Keluhan Anda
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                Tulis keluhan atau kendala yang Anda temui di kamar. Tim kami akan menindaklanjuti.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                {error && (
                  <p
                    role="alert"
                    className="rounded-[4px] border border-[var(--danger)] px-3 py-2 text-xs leading-relaxed text-[var(--danger)]"
                  >
                    {error}
                  </p>
                )}

                <label className="block">
                  <span className="eyebrow">Keluhan</span>
                  <textarea
                    value={rawText}
                    onChange={(event) => {
                      setRawText(event.target.value);
                      if (error) setError(null);
                    }}
                    rows={6}
                    maxLength={2000}
                    required
                    placeholder="mis. AC kamar tidak dingin sejak tadi malam."
                    className="field mt-1.5 w-full resize-y"
                  />
                  <span className="mt-1 block text-right text-[11px] text-[var(--ink-muted)]">
                    {rawText.length}/2000
                  </span>
                </label>

                <label className="block">
                  <span className="eyebrow">Nama Tamu (opsional)</span>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={80}
                    placeholder="mis. Budi"
                    className="field mt-1.5 w-full"
                  />
                </label>

                <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
                  {submitting ? 'Mengirim...' : 'Kirim Keluhan'}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-[var(--ink-muted)]">
                  Tidak perlu masuk atau membuat akun.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function TamuPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-4 py-10">
          <p className="text-sm text-[var(--ink-muted)]">Memuat form keluhan...</p>
        </main>
      }
    >
      <GuestComplaintForm />
    </Suspense>
  );
}
