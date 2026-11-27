'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  QrCode,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { ComplaintsProvider, useComplaints } from '@/lib/use-complaints';
import ComplaintDetail from '@/components/complaint-detail';

interface NavItem {
  href: string;
  label: string;
  title: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dasbor', label: 'Dasbor', title: 'Dasbor Keluhan', icon: LayoutDashboard },
  { href: '/catat', label: 'Catat Keluhan', title: 'Catat Keluhan', icon: PlusCircle },
  { href: '/keluhan', label: 'Daftar Keluhan', title: 'Daftar Keluhan', icon: ClipboardList },
  { href: '/qr', label: 'QR Kamar', title: 'QR Kamar', icon: QrCode },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { complaints, notice, error, aiStatus } = useComplaints();

  const activeCount = complaints.filter(
    (item) => item.status === 'baru' || item.status === 'diproses'
  ).length;

  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href));
  const banner = notice ?? (error ? { type: 'err' as const, text: error } : null);

  return (
    <div className="app-shell min-h-screen w-full bg-[var(--paper)] text-[var(--ink)] lg:flex">
      {/* SIDEBAR */}
      <aside className="app-sidebar flex w-full shrink-0 select-none flex-col justify-between border-b border-[var(--line)] lg:w-60 lg:border-b-0 lg:border-r">
        <div>
          <div className="border-b border-[var(--line)] px-5 py-5">
            <p className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">SmartGuest</p>
            <p className="eyebrow mt-1">Operasional Hotel</p>
          </div>

          <nav className="flex flex-wrap gap-1 px-3 py-3 lg:block lg:space-y-0.5 lg:px-4 lg:py-4">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-auto items-center gap-2.5 border-l-2 px-3 py-2 text-left text-[13px] lg:w-full ${
                    active
                      ? 'border-l-[var(--accent)] font-semibold text-[var(--ink)]'
                      : 'border-l-transparent font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {item.href === '/keluhan' && activeCount > 0 && (
                    <span className="ml-auto text-[11px] font-medium tabular-nums text-[var(--ink-muted)]">
                      {activeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[var(--line)] px-4 py-4">
          <div className="mb-3 px-1">
            <p className="truncate text-[13px] font-medium text-[var(--ink)]">{user?.full_name}</p>
            <p className="eyebrow mt-0.5">Petugas</p>
          </div>

          <button onClick={logout} className="btn btn-secondary btn-xs btn-block">
            <LogOut size={16} strokeWidth={1.5} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* KONTEN UTAMA */}
      <main className="app-main flex min-w-0 flex-1 flex-col">
        <header className="app-header flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-3 lg:px-8">
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">
            {current?.title ?? 'Dasbor Keluhan'}
          </h1>

          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-[var(--ink-muted)]">
            {aiStatus &&
              (aiStatus.configured ? (
                <span className="flex items-center gap-1.5" title="Klasifikasi memakai LLM">
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

        {banner && (
          <div
            className={`mx-6 mt-4 rounded-[4px] border bg-[var(--surface)] px-4 py-2 text-xs font-medium lg:mx-8 ${
              banner.type === 'ok'
                ? 'border-[var(--line)] text-[var(--accent)]'
                : 'border-[var(--danger)] text-[var(--danger)]'
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="flex-1 px-6 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* PANEL DETAIL */}
      <ComplaintDetail />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--paper)]">
        <p className="text-sm text-[var(--ink-muted)]">Memeriksa sesi petugas...</p>
      </div>
    );
  }

  return (
    <ComplaintsProvider>
      <AppChrome>{children}</AppChrome>
    </ComplaintsProvider>
  );
}
