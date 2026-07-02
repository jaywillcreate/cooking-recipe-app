import { query, queryOne } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

interface Totals {
  users: number; new_users: number; ai_recipes: number; saves: number; gens_24h: number; tokens_30d: string;
}

export default async function Overview() {
  const [totals, gen7, topUsers, recentErrors, releases] = await Promise.all([
    queryOne<Totals>(`SELECT
        (SELECT count(*) FROM users WHERE status='active')::int AS users,
        (SELECT count(*) FROM users WHERE created_at > now()-interval '7 days')::int AS new_users,
        (SELECT count(*) FROM recipes WHERE origin IN ('ai','daily','web'))::int AS ai_recipes,
        (SELECT count(*) FROM saves)::int AS saves,
        (SELECT count(*) FROM ai_usage WHERE created_at > now()-interval '24 hours')::int AS gens_24h,
        (SELECT COALESCE(sum(input_tokens+output_tokens),0) FROM ai_usage WHERE created_at > now()-interval '30 days')::text AS tokens_30d`),
    query<{ day: string; n: number }>(`SELECT to_char(date_trunc('day', created_at),'Mon DD') AS day, count(*)::int AS n
             FROM ai_usage WHERE created_at > now()-interval '7 days' GROUP BY 1 ORDER BY min(created_at)`),
    query<{ email: string; gens: number }>(`SELECT u.email, count(*)::int AS gens FROM ai_usage a JOIN users u ON u.id=a.user_id
             WHERE a.created_at > now()-interval '7 days' GROUP BY u.email ORDER BY gens DESC LIMIT 8`),
    query<{ kind: string; error: string | null; created_at: string }>(`SELECT kind, error, created_at FROM ai_usage WHERE success=FALSE ORDER BY created_at DESC LIMIT 8`),
    query<{ version: string; channel: string; title: string; released_at: string }>(`SELECT version, channel, title, released_at FROM releases ORDER BY released_at DESC LIMIT 5`),
  ]);
  const t = totals!;
  const max = Math.max(1, ...gen7.map((g) => g.n));

  return (
    <>
      <h1>Overview</h1>
      <div className="admin-grid admin-kpis">
        <div className="admin-kpi"><small>Active users</small><b>{t.users}</b></div>
        <div className="admin-kpi"><small>New (7d)</small><b>{t.new_users}</b></div>
        <div className="admin-kpi"><small>AI recipes</small><b>{t.ai_recipes}</b></div>
        <div className="admin-kpi"><small>Saves</small><b>{t.saves}</b></div>
        <div className="admin-kpi"><small>Generations (24h)</small><b>{t.gens_24h}</b></div>
        <div className="admin-kpi"><small>Tokens (30d)</small><b>{Number(t.tokens_30d).toLocaleString()}</b></div>
      </div>

      <div className="admin-card">
        <h2>AI generations · last 7 days</h2>
        {gen7.length === 0 ? (
          <p className="admin-muted">No generations yet.</p>
        ) : (
          <div className="bars" style={{ height: 90 }}>
            {gen7.map((g) => (
              <div key={g.day} style={{ flex: 1 }}>
                <div className="bar" style={{ height: Math.round((g.n / max) * 90) }} title={String(g.n)} />
                <small className="admin-muted" style={{ display: 'block', textAlign: 'center', fontSize: 10, marginTop: 6 }}>
                  {g.day}<br /><b>{g.n}</b>
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="admin-card">
          <h2>Most active users (7d)</h2>
          <table>
            <tbody>
              <tr><th>User</th><th style={{ textAlign: 'right' }}>Generations</th></tr>
              {topUsers.map((u) => (
                <tr key={u.email}><td>{u.email}</td><td style={{ textAlign: 'right' }}><b>{u.gens}</b></td></tr>
              ))}
              {topUsers.length === 0 && <tr><td colSpan={2} className="admin-muted">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="admin-card">
          <h2>Recent generation errors</h2>
          <table>
            <tbody>
              <tr><th>Kind</th><th>Error</th><th>When</th></tr>
              {recentErrors.map((e, i) => (
                <tr key={i}><td>{e.kind}</td><td><code>{(e.error || '').slice(0, 40)}</code></td><td className="admin-muted">{new Date(e.created_at).toLocaleString()}</td></tr>
              ))}
              {recentErrors.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--green)' }}>No errors 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <h2>Latest releases</h2>
        <table>
          <tbody>
            <tr><th>Version</th><th>Channel</th><th>Title</th><th>Date</th></tr>
            {releases.map((r, i) => (
              <tr key={i}><td><code>{r.version}</code></td><td>{r.channel}</td><td>{r.title}</td><td className="admin-muted">{new Date(r.released_at).toLocaleDateString()}</td></tr>
            ))}
            {releases.length === 0 && <tr><td colSpan={4} className="admin-muted">No releases logged.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
