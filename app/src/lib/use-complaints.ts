'use client';

// State bersama untuk seluruh shell aplikasi.
//
// Sidebar (angka keluhan aktif), dasbor, form, tabel, dan drawer detail
// memakai satu daftar keluhan yang sama supaya perubahan status langsung
// terlihat di semua permukaan tanpa fetch ulang per halaman.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '@/lib/client';
import type { ActivityLog, Complaint, ComplaintAnalysis } from '@/lib/types';

export interface ComplaintDetails {
  complaint: Complaint;
  analysis?: ComplaintAnalysis;
  logs: ActivityLog[];
}

export interface AiStatus {
  configured: boolean;
  model: string;
}

interface Notice {
  type: 'ok' | 'err';
  text: string;
}

interface ComplaintsContextValue {
  complaints: Complaint[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateComplaint: (complaint: Complaint) => void;
  showError: (message: string) => void;
  notice: Notice | null;
  aiStatus: AiStatus | null;
  selectedId: string | null;
  details: ComplaintDetails | null;
  loadingDetails: boolean;
  detailsError: string | null;
  openDetails: (id: string) => Promise<void>;
  closeDetails: () => void;
}

const ComplaintsContext = createContext<ComplaintsContextValue | null>(null);

interface LoadResult {
  complaints?: Complaint[];
  error?: string;
}

async function loadComplaints(): Promise<LoadResult> {
  const result = await apiFetch<{ complaints: Complaint[] }>('/api/complaints', {
    cache: 'no-store',
  });

  if (result.ok) {
    return { complaints: result.data?.complaints || [] };
  }
  if (result.status === 401) {
    return {};
  }
  return { error: result.error || 'Gagal memuat daftar keluhan.' };
}

export function ComplaintsProvider({ children }: { children: React.ReactNode }) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ComplaintDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Notifikasi singkat: pesan sukses hilang setelah 3 detik, galat 4 detik.
  const showNotice = useCallback((next: Notice, timeout: number) => {
    setNotice(next);
    window.setTimeout(
      () => setNotice((current) => (current?.text === next.text ? null : current)),
      timeout
    );
  }, []);

  const showError = useCallback(
    (message: string) => showNotice({ type: 'err', text: message }, 4000),
    [showNotice]
  );

  const refresh = useCallback(async () => {
    const result = await loadComplaints();

    if (result.complaints) {
      setComplaints(result.complaints);
      setError(null);
    } else if (result.error) {
      setError(result.error);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadComplaints();
      if (cancelled) return;

      if (result.complaints) {
        setComplaints(result.complaints);
        setError(null);
      } else if (result.error) {
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    apiFetch<AiStatus>('/api/ai-status', { cache: 'no-store' }).then((result) => {
      if (result.ok && result.data) setAiStatus(result.data);
    });
  }, []);

  const openDetails = useCallback(async (id: string) => {
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
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    setDetails(null);
    setDetailsError(null);
  }, []);

  const updateComplaint = useCallback(
    (updated: Complaint) => {
      setComplaints((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setDetails((previous) =>
        previous && previous.complaint.id === updated.id
          ? { ...previous, complaint: updated }
          : previous
      );

      showNotice({ type: 'ok', text: 'Keluhan berhasil diperbarui.' }, 3000);

      // Muat ulang jejak aktivitas setelah koreksi/pindah status.
      if (selectedId === updated.id) {
        apiFetch<ComplaintDetails>(`/api/complaints/${updated.id}`, {
          cache: 'no-store',
        }).then((result) => {
          if (result.ok && result.data) setDetails(result.data);
        });
      }
    },
    [selectedId, showNotice]
  );

  const value = useMemo<ComplaintsContextValue>(
    () => ({
      complaints,
      loading,
      error,
      refresh,
      updateComplaint,
      showError,
      notice,
      aiStatus,
      selectedId,
      details,
      loadingDetails,
      detailsError,
      openDetails,
      closeDetails,
    }),
    [
      complaints,
      loading,
      error,
      refresh,
      updateComplaint,
      showError,
      notice,
      aiStatus,
      selectedId,
      details,
      loadingDetails,
      detailsError,
      openDetails,
      closeDetails,
    ]
  );

  return React.createElement(ComplaintsContext.Provider, { value }, children);
}

export function useComplaints(): ComplaintsContextValue {
  const context = useContext(ComplaintsContext);
  if (context === null) {
    throw new Error('useComplaints must be used within a ComplaintsProvider');
  }
  return context;
}
