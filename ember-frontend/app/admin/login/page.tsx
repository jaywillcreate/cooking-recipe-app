import { redirect } from 'next/navigation';
import { readAdminSession } from '@/lib/server/adminSession';
import { adminLogin } from '../actions';
import '../admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin sign in · Ember', robots: { index: false, follow: false } };

export default function AdminLogin({ searchParams }: { searchParams: { error?: string } }) {
  if (readAdminSession()) redirect('/admin');
  return (
    <div className="admin">
      <div style={{ maxWidth: 380, margin: '8vh auto', padding: '0 20px' }}>
        <div className="admin-brand" style={{ fontSize: 26, textAlign: 'center', marginBottom: 6 }}>
          EMBER<span>.</span>
        </div>
        <p className="admin-muted" style={{ textAlign: 'center', fontSize: 13, margin: '0 0 22px' }}>Admin dashboard</p>
        <div className="admin-card">
          {searchParams.error && <div className="err">Invalid credentials or not an admin.</div>}
          <form action={adminLogin}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Email</label>
            <input type="email" name="email" autoComplete="username" required style={{ margin: '6px 0 14px' }} />
            <label style={{ fontSize: 12, fontWeight: 700 }}>Password</label>
            <input type="password" name="password" autoComplete="current-password" required style={{ margin: '6px 0 18px' }} />
            <button className="btn" type="submit" style={{ width: '100%' }}>Sign in</button>
          </form>
        </div>
        <p className="admin-muted" style={{ textAlign: 'center', fontSize: 11 }}>
          Admin accounts are created with <code>npm run create-admin</code>.
        </p>
      </div>
    </div>
  );
}
