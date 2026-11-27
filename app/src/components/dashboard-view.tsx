'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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

import { GuestBadge, StatusBadge } from '@/components/complaint-badges';
import { useComplaints } from '@/lib/use-complaints';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  STATUS_LABELS,
  categoryLabel,
  channelLabel,
  departmentLabel,
  type CategoryCode,
  type ComplaintStatus,
} from '@/lib/types';

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

export default function DashboardView() {
  const { complaints, loading, openDetails } = useComplaints();

  const total = complaints.length;
  const countByStatus = (status: ComplaintStatus) =>
    complaints.filter((item) => item.status === status).length;
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

  const latestComplaints = complaints.slice(0, 5);

  const summaryItems = [
    { label: 'Total', value: total },
    { label: 'Baru', value: countByStatus('baru') },
    { label: 'Diproses', value: countByStatus('diproses') },
    { label: 'Selesai', value: countByStatus('selesai') },
    { label: 'Kategori Perlu Ditinjau', value: perluDitinjau },
  ];

  return (
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
          <Link
            href="/keluhan"
            className="flex items-center gap-1 text-[12px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <span>Lihat semua</span>
            <ChevronRight size={16} strokeWidth={1.5} />
          </Link>
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
  );
}
