// Halaman QR kamar (server component, tanpa sesi).
//
// QR dirender sebagai SVG inline di server memakai paket `qrcode`, sehingga
// halaman bisa langsung dicetak tanpa JavaScript klien dan tanpa aset gambar.

import QRCode from 'qrcode';
import { headers } from 'next/headers';

import { MAX_ROOM_NUMBER, normalizeRoomNumber } from '@/lib/validation';

function normalizeRoom(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return normalizeRoomNumber(raw);
}

export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<{ kamar?: string | string[] }>;
}) {
  const params = await searchParams;
  const roomNumber = normalizeRoom(params.kamar);

  const requestHeaders = await headers();

  // Base URL: env eksplisit bila diisi, selain itu proto dari proxy (bila ada)
  // lalu host. Fallback http agar tetap berfungsi di localhost tanpa proxy.
  const configuredBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const forwardedProto = requestHeaders
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  const proto = forwardedProto === 'https' ? 'https' : 'http';
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const baseUrl = configuredBase
    ? configuredBase.replace(/\/+$/, '')
    : `${proto}://${host}`;

  const guestPath = roomNumber ? `/tamu?kamar=${encodeURIComponent(roomNumber)}` : '/tamu';
  const guestUrl = `${baseUrl}${guestPath}`;

  const qrSvg = await QRCode.toString(guestUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 260,
    color: { dark: '#1B1A17', light: '#FFFFFF' },
  });

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <h1 className="sr-only">QR Form Tamu Kamar {roomNumber || '(tanpa nomor kamar)'}</h1>
        <p className="eyebrow">SmartGuest · QR Kamar</p>

        <div className="panel mt-4 p-6 sm:p-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-3">
              <div
                className="rounded-[4px] border border-[var(--line)] bg-[var(--surface)] p-3"
                // SVG dihasilkan sendiri oleh paket `qrcode`, bukan input pengguna.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="max-w-[260px] break-all text-center font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
                {guestUrl}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <p className="eyebrow">Nomor Kamar</p>
              <p className="mt-1 text-5xl font-semibold leading-none tracking-tight text-[var(--ink)] [font-variant-numeric:tabular-nums]">
                {roomNumber || '—'}
              </p>

              <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)]">
                Cetak dan tempel di kamar. Tamu memindai untuk melapor.
              </p>

              <form action="/qr" method="get" className="mt-6 space-y-2">
                <label className="block">
                  <span className="eyebrow">Ganti Nomor Kamar</span>
                  <input
                    type="text"
                    name="kamar"
                    defaultValue={roomNumber}
                    maxLength={MAX_ROOM_NUMBER}
                    pattern="[A-Za-z0-9-]*"
                    placeholder="mis. 302"
                    className="field mt-1.5 w-full"
                  />
                </label>
                <button type="submit" className="btn btn-primary btn-block">
                  Tampilkan QR
                </button>
              </form>

              <a href={guestPath} className="btn btn-quiet btn-block mt-2">
                Buka form tamu
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
