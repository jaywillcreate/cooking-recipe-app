import { query } from '@/lib/server/db';
import { createRelease } from '../../actions';

export const dynamic = 'force-dynamic';

interface ReleaseRow {
  id: string; version: string; channel: string; title: string; notes: string; released_at: string; released_by_email: string | null;
}

export default async function Releases({ searchParams }: { searchParams: { error?: string } }) {
  const releases = await query<ReleaseRow>(
    `SELECT r.*, u.email AS released_by_email FROM releases r LEFT JOIN users u ON u.id=r.released_by ORDER BY r.released_at DESC`,
  );
  const errorMsg =
    searchParams.error === 'duplicate' ? 'A release with that version + channel already exists.' :
    searchParams.error === 'invalid' ? 'Version, channel and title are required.' : null;

  return (
    <>
      <h1>Release log</h1>
      <p className="admin-muted" style={{ fontSize: 13.5, marginTop: -8 }}>A permanent record of every Ember web-application release.</p>
      <div className="admin-grid" style={{ gridTemplateColumns: '340px 1fr', alignItems: 'start' }}>
        <div className="admin-card">
          <h2>Log a release</h2>
          {errorMsg && <div className="err">{errorMsg}</div>}
          <form action={createRelease}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Version</label>
            <input type="text" name="version" placeholder="1.2.0" required style={{ margin: '6px 0 12px' }} />
            <label style={{ fontSize: 12, fontWeight: 700 }}>Channel</label>
            <select name="channel" style={{ margin: '6px 0 12px' }}>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="beta">beta</option>
            </select>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Title</label>
            <input type="text" name="title" placeholder="Daily email delivery + web sources" required style={{ margin: '6px 0 12px' }} />
            <label style={{ fontSize: 12, fontWeight: 700 }}>Notes (markdown)</label>
            <textarea name="notes" placeholder={'- Added…\n- Fixed…'} />
            <button className="btn" type="submit" style={{ width: '100%', marginTop: 12 }}>Save release</button>
          </form>
        </div>
        <div className="admin-card">
          <h2>History</h2>
          <table>
            <tbody>
              <tr><th>Version</th><th>Channel</th><th>Title</th><th>By</th><th>Date</th></tr>
              {releases.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.version}</code></td>
                  <td><span className={`pill ${r.channel === 'production' ? 'active' : ''}`}>{r.channel}</span></td>
                  <td>
                    <b>{r.title}</b>
                    {r.notes && <><br /><span className="admin-muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{r.notes.slice(0, 180)}</span></>}
                  </td>
                  <td className="admin-muted" style={{ fontSize: 12 }}>{r.released_by_email || 'system'}</td>
                  <td className="admin-muted" style={{ fontSize: 12 }}>{new Date(r.released_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {releases.length === 0 && <tr><td colSpan={5} className="admin-muted">No releases logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
