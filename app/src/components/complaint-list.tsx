'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import { GuestBadge, StatusBadge } from '@/components/complaint-badges';
import { StatusControl } from '@/components/complaint-detail';
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

export default function ComplaintList() {
  const { complaints, loading, selectedId, openDetails, updateComplaint, showError } =
    useComplaints();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ComplaintStatus>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'unverified' | CategoryCode>('all');

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

  const hasFilter = Boolean(searchTerm) || filterStatus !== 'all' || filterCategory !== 'all';

  return (
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

          {hasFilter && (
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
                      <StatusControl complaint={item} onUpdated={updateComplaint} onError={showError} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
