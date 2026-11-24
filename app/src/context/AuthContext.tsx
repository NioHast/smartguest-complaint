'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Restore the session from the httpOnly cookie (no localStorage, no JWT).
  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch('/api/auth', { method: 'GET', cache: 'no-store' });
        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
          }
          return;
        }
        const data = await response.json();
        if (!cancelled && data?.session?.user) {
          setUser(data.session.user);
        }
      } catch (e) {
        console.error('Failed to restore session:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoading(false);
        return { success: false, error: data.error || 'Autentikasi gagal.' };
      }

      if (data.session) {
        setUser(data.session.user);
        setLoading(false);
        router.push('/');
        return { success: true };
      }

      setLoading(false);
      return { success: false, error: 'Respons server tidak dikenali.' };
    } catch (e: any) {
      setLoading(false);
      return { success: false, error: e.message || 'Kesalahan jaringan.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to clear session:', e);
    }
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
