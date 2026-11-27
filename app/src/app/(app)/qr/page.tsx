// Halaman QR kamar (server component di dalam shell, perlu sesi petugas).
//
// Menerima daftar kamar lewat query `?kamar=101,102,305`. Setiap QR dirender
// sebagai SVG inline di server memakai paket `qrcode`, sehingga halaman bisa
// langsung dicetak tanpa JavaScript klien dan tanpa aset gambar.

import QRCode from 'qrcode';
import { headers } from 'next/headers';

import { MAX_QR_ROOMS, parseRoomList } from '@/lib/rooms';
import QrControls from './controls';

interface RoomCard {
  room: string;
  guestUrl: string;
  svg: string;
}

const QR_COLOR = { dark: '#1B1A17', light: '#FFFFFF' };

export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<{ kamar?: string | string[] }>;
}) {
  const params = await searchParams;
  const { rooms, truncated } = parseRoomList(params.kamar);

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

  const cards: RoomCard[] = await Promise.all(
    rooms.map(async (room) => {
      const guestPath = `/tamu?kamar=${encodeURIComponent(room)}`;
      const guestUrl = `${baseUrl}${guestPath}`;
      const svg = await QRCode.toString(guestUrl, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 300,
        color: QR_COLOR,
      });
      return { room, guestUrl, svg };
    })
  );

  const isSingle = cards.length === 1;
  const singleCard = isSingle ? cards[0] : null;

  return (
    <div className="qr-page min-h-screen w-full bg-[var(--paper)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">SmartGuest · QR Kamar</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
              QR Kamar
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
              Cetak dan tempel di kamar. Tamu memindai untuk melapor.
            </p>
          </div>
          <p className="text-xs font-semibold text-[var(--ink-muted)]">
            {cards.length} kamar
          </p>
        </div>

        {truncated && (
          <p
            className="mt-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-muted)]"
            role="status"
          >
            {`Menampilkan ${MAX_QR_ROOMS} kamar pertama`}
          </p>
        )}

        <QrControls key={rooms.join(',')} initialRooms={rooms.join(',')} />

        {singleCard ? (
          <article className="qr-card qr-card-single panel mt-6 flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
            <div
              className="qr-code shrink-0 rounded-[4px] border border-[var(--line)] bg-[var(--surface)] p-3 [&>svg]:h-[200px] [&>svg]:w-[200px] sm:[&>svg]:h-[220px] sm:[&>svg]:w-[220px]"
              // SVG dihasilkan sendiri oleh paket `qrcode`, bukan input pengguna.
              dangerouslySetInnerHTML={{ __html: singleCard.svg }}
            />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="eyebrow">Nomor Kamar</p>
              <p className="mt-1 text-5xl font-semibold leading-none tracking-tight text-[var(--ink)] [font-variant-numeric:tabular-nums]">
                {singleCard.room}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--ink-muted)]">
                Cetak dan tempel di kamar. Tamu memindai untuk melapor.
              </p>
              <p className="qr-url mt-4 break-all font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
                {singleCard.guestUrl}
              </p>
            </div>
          </article>
        ) : (
          <div className="qr-grid mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((card) => (
              <article
                key={card.room}
                className="qr-card panel flex flex-col items-center gap-2.5 break-inside-avoid p-3 text-center"
              >
                <div
                  className="qr-code rounded-[4px] border border-[var(--line)] bg-[var(--surface)] p-2 [&>svg]:h-[150px] [&>svg]:w-[150px]"
                  // SVG dihasilkan sendiri oleh paket `qrcode`, bukan input pengguna.
                  dangerouslySetInnerHTML={{ __html: card.svg }}
                />
                <p className="text-xl font-semibold leading-none tracking-tight text-[var(--ink)] [font-variant-numeric:tabular-nums]">
                  {card.room}
                </p>
                <p className="qr-url w-full break-all font-mono text-[9px] leading-snug text-[var(--ink-muted)]">
                  {card.guestUrl}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
