import { redirect } from 'next/navigation';

// Redirect harus terjadi per permintaan (HTTP 307), bukan dibekukan saat
// prerender menjadi payload NEXT_REDIRECT di HTML statis.
export const dynamic = 'force-dynamic';

export default function RootPage() {
  redirect('/dasbor');
}
