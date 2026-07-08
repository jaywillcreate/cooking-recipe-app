import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readAdminSession } from '@/lib/server/adminSession';
import { Wordmark } from '@/components/Wordmark';
import { adminLogout } from '../actions';
import '../admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'TastyEmber Admin', robots: { index: false, follow: false } };

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const session = readAdminSession();
  if (!session) redirect('/admin/login');
  return (
    <div className="admin">
      <header className="admin-top">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Wordmark size={20} />
          <span className="admin-muted" style={{ fontWeight: 700, fontSize: 13 }}>admin</span>
        </div>
        <nav className="admin-tabs">
          <Link href="/admin">Overview</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/releases">Releases</Link>
        </nav>
        <form action={adminLogout}>
          <button className="btn ghost sm" type="submit">Sign out</button>
        </form>
      </header>
      <main className="admin-wrap">{children}</main>
    </div>
  );
}
