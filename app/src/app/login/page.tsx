'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { user, login, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Gagal masuk.');
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string) => {
    setLoading(true);
    setError(null);
    setEmail(demoEmail);
    setPassword('password');

    const result = await login(demoEmail, 'password');
    if (!result.success) {
      setError(result.error || 'Gagal masuk.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[var(--paper)]">
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        {/* Panel kiri: identitas produk di atas kertas */}
        <section className="flex flex-col justify-between border-b border-[var(--line)] px-6 py-10 sm:px-10 lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
          <div>
            <p className="eyebrow">Operasional Hotel</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[var(--ink)]">
              SmartGuest
            </h1>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-[var(--ink-muted)]">
              Manajemen Keluhan Tamu Hotel
            </p>
          </div>
          <p className="mt-10 text-xs text-[var(--ink-muted)]">
            Sistem internal operasional hotel
          </p>
        </section>

        {/* Panel kanan: form di atas permukaan putih */}
        <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="panel w-full max-w-md p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <p className="rounded-[4px] border border-[var(--danger)] px-3 py-2 text-xs leading-relaxed text-[var(--danger)]">
                  {error}
                </p>
              )}

              <label className="block">
                <span className="eyebrow">Email Petugas</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="mis. staff@smartguest.local"
                  className="field mt-1.5 w-full"
                  required
                />
              </label>

              <label className="block">
                <span className="eyebrow">Kata Sandi</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="field mt-1.5 w-full"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span className="eyebrow">Akun Demo</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <button
              onClick={() => handleQuickLogin('staff@smartguest.local')}
              disabled={loading}
              className="flex w-full items-start justify-between gap-3 rounded-[4px] border border-[var(--line)] px-3 py-3 text-left hover:bg-[#FBFAF7] disabled:opacity-50"
            >
              <span>
                <span className="block text-[13px] font-medium text-[var(--ink)]">
                  Humphrey Bogart
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                  staff@smartguest.local · kata sandi: password
                </span>
              </span>
              <span className="badge badge-neutral">Petugas</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
