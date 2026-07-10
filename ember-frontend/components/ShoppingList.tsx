'use client';
import { useState } from 'react';
import { storesApi, ApiError, type StoreResult } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';

/**
 * Shopping-list export (copy / download) + a keyless store locator: the user
 * enters a ZIP and we list nearby grocery stores that would carry the items.
 */
export function ShoppingList({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listText = `Shopping list — ${title}\n\n${items.map((i) => `☐ ${i}`).join('\n')}\n\n— via TastyEmber`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(listText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed — select and copy the list manually.');
    }
  }

  function download() {
    const blob = new Blob([listText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopping-list-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function findStores(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{5}$/.test(zip.trim())) {
      setError('Enter a 5-digit US ZIP code.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      setResult(await storesApi.near(zip.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't look up stores right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const pill: React.CSSProperties = { background: 'none', border: `1.5px solid ${C.line22}`, color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 16px', borderRadius: 999, cursor: 'pointer' };

  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: C.dark, color: C.bg, fontWeight: 800, fontSize: 13.5, padding: '13px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        🛒 Shopping list &amp; stores
      </button>

      {open && (
        <div style={{ marginTop: 12, padding: '16px 18px', background: C.bg, borderRadius: 12, animation: 'emberFade 0.2s ease' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, marginBottom: 10 }}>Export your list</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={copy} style={pill}>{copied ? '✓ Copied' : '📋 Copy list'}</button>
            <button onClick={download} style={pill}>⬇ Download .txt</button>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted55, marginBottom: 18 }}>{items.length} items — reflects your current serving size.</div>

          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, marginBottom: 8, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>Find stores near you</div>
          <form onSubmit={findStores} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={zip}
              onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null); }}
              inputMode="numeric"
              placeholder="ZIP code"
              style={{ border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: mono, fontSize: 14, background: '#fff', color: C.ink, width: 120 }}
            />
            <button type="submit" disabled={busy} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {busy && <Spinner size={14} color="#fff" />}Find stores
            </button>
          </form>

          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{error}</div>}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                Grocery stores near {result.location.city}, {result.location.state}
              </div>
              {result.stores.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.stores.map((s, i) => (
                    <a key={i} href={s.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>🏪</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{s.name}</div>
                        {s.address && <div style={{ fontSize: 11.5, color: C.muted55 }}>{s.address}</div>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.green, flex: 'none' }}>{s.distanceMi} mi</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: C.muted65 }}>No stores found in the map data for that area — use the map link below.</div>
              )}
              <a href={result.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 12, fontSize: 12.5, fontWeight: 700, color: C.rust }}>
                See all grocery stores near {result.location.zip} in Maps →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
