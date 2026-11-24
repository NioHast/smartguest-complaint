// Helper fetch untuk komponen klien.
//
// Menyatukan penanganan sesi berakhir (401 -> /login) dan kegagalan lain agar
// pemanggil tidak perlu menelan error secara diam-diam.

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

function errorMessageFrom(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: null, error: 'Tidak dapat menghubungi server.' };
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return {
      ok: false,
      status: 401,
      data: null,
      error: 'Sesi berakhir. Silakan masuk kembali.',
    };
  }

  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      error: errorMessageFrom(data) ?? 'Permintaan gagal diproses.',
    };
  }

  return { ok: true, status: response.status, data };
}
