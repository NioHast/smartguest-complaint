'use client';

import { statusLabel, type ComplaintStatus } from '@/lib/types';

const STATUS_BADGE: Record<ComplaintStatus, string> = {
  baru: 'badge-neutral',
  diproses: 'badge-warn',
  selesai: 'badge-accent',
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status]}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

/** Penanda netral untuk keluhan yang dicatat tamu lewat QR tanpa sesi petugas. */
export function GuestBadge() {
  return <span className="badge badge-neutral">Tamu</span>;
}
