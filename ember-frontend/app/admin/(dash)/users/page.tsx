import { query } from '@/lib/server/db';
import { setUserStatus } from '../../actions';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string; email: string; role: string; status: string; created_at: string; name: string | null;
  email_daily: boolean; cuisines: string[] | null; diets: string[] | null; goal: string | null;
  saves: number; gens: number;
}

export default async function Users({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').slice(0, 100);
  const users = await query<UserRow>(
    `SELECT u.id, u.email, u.role, u.status, u.created_at, p.name, p.email_daily, p.cuisines, p.diets, p.goal,
            (SELECT count(*) FROM saves s WHERE s.user_id=u.id)::int AS saves,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id=u.id)::int AS gens
       FROM users u LEFT JOIN profiles p ON p.user_id=u.id
      WHERE ($1='' OR u.email ILIKE '%'||$1||'%' OR p.name ILIKE '%'||$1||'%')
      ORDER BY u.created_at DESC LIMIT 100`,
    [q],
  );

  return (
    <>
      <h1>Users &amp; profiles</h1>
      <form method="get" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" name="q" defaultValue={q} placeholder="Search by email or name…" style={{ maxWidth: 320 }} />
        <button className="btn" type="submit">Search</button>
        {q && <a className="btn ghost sm" href="/admin/users">Clear</a>}
      </form>
      <div className="admin-card" style={{ overflowX: 'auto' }}>
        <table>
          <tbody>
            <tr>
              <th>User</th><th>Status</th><th>Profile</th><th>Daily</th>
              <th style={{ textAlign: 'right' }}>Saves</th><th style={{ textAlign: 'right' }}>Gens</th><th>Joined</th><th>Actions</th>
            </tr>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name || '—'}</b><br />
                  <span className="admin-muted" style={{ fontSize: 12 }}>{u.email}</span>
                  {u.role === 'admin' && <> <span className="pill admin-role">admin</span></>}
                </td>
                <td><span className={`pill ${u.status}`}>{u.status}</span></td>
                <td className="admin-muted" style={{ fontSize: 12 }}>
                  {(u.cuisines || []).slice(0, 3).join(', ') || 'no cuisines'}<br />
                  {(u.diets || []).join(', ') || 'no diet'} · {u.goal || '—'}
                </td>
                <td>{u.email_daily ? '✓ on' : '—'}</td>
                <td style={{ textAlign: 'right' }}>{u.saves}</td>
                <td style={{ textAlign: 'right' }}>{u.gens}</td>
                <td className="admin-muted" style={{ fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  {u.role !== 'admin' && (
                    <form action={setUserStatus}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === 'active' ? 'suspended' : 'active'} />
                      <button className="btn ghost sm" type="submit">{u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={8} className="admin-muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="admin-muted" style={{ fontSize: 12 }}>Showing up to 100 accounts. Profiles reflect each user&apos;s taste settings used to personalise generation.</p>
    </>
  );
}
