'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { MAX_QR_ROOMS } from '@/lib/rooms';

interface QrControlsProps {
  /** Daftar kamar yang sedang tampil, sudah dipisah koma. */
  initialRooms: string;
}

/** Rangkai entri daftar menjadi nilai query yang bersih. */
function normalizeList(value: string): string {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',');
}

export default function QrControls({ initialRooms }: QrControlsProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialRooms);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  const navigate = (list: string) => {
    const cleaned = normalizeList(list);
    router.push(cleaned ? `/qr?kamar=${encodeURIComponent(cleaned)}` : '/qr');
  };

  const handleListSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(value);
  };

  const handleRangeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const fromText = from.trim();
    const toText = to.trim();

    if (!/^\d+$/.test(fromText) || !/^\d+$/.test(toText)) {
      setRangeError('Isi Dari dan Sampai dengan angka saja.');
      return;
    }

    const start = Number(fromText);
    const end = Number(toText);

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      setRangeError('Angka terlalu besar.');
      return;
    }
    if (start > end) {
      setRangeError('Dari harus lebih kecil atau sama dengan Sampai.');
      return;
    }
    if (end - start > MAX_QR_ROOMS) {
      setRangeError(`Rentang maksimum ${MAX_QR_ROOMS} angka.`);
      return;
    }

    const existing = normalizeList(value);
    const added: string[] = [];
    for (let room = start; room <= end; room += 1) {
      added.push(String(room));
    }

    const next = existing ? `${existing},${added.join(',')}` : added.join(',');
    setRangeError(null);
    setValue(next);
    navigate(next);
  };

  return (
    <section className="qr-controls panel mt-6 p-4 sm:p-5" aria-label="Kontrol QR kamar">
      <form onSubmit={handleListSubmit}>
        <label htmlFor="qr-room-list" className="eyebrow block">
          Daftar kamar
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="qr-room-list"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="mis. 101,102,305,PH1"
            autoComplete="off"
            spellCheck={false}
            className="field w-full flex-1"
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Tampilkan
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
          Pisahkan dengan koma, maksimal {MAX_QR_ROOMS} kamar.
        </p>
      </form>

      <form
        onSubmit={handleRangeSubmit}
        className="mt-4 border-t border-[var(--line)] pt-4"
      >
        <p className="eyebrow">Tambah rentang</p>
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Dari
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="201"
              className="field mt-1 w-24"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">
              Sampai
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="205"
              className="field mt-1 w-24"
            />
          </label>
          <button type="submit" className="btn btn-secondary">
            Tambahkan
          </button>
        </div>
        {rangeError ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--danger)]" role="alert">
            {rangeError}
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
            Angka ditambahkan ke daftar, bukan menimpa.
          </p>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
        <button type="button" onClick={() => window.print()} className="btn btn-primary">
          Cetak
        </button>
        <button
          type="button"
          onClick={() => {
            setValue('');
            setRangeError(null);
            router.push('/qr');
          }}
          className="btn btn-quiet"
        >
          Kosongkan
        </button>
      </div>
    </section>
  );
}
