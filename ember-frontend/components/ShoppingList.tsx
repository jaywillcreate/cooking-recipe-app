'use client';
import { useEffect, useState } from 'react';
import { storesApi, shoppingApi, ApiError, type StoreResult } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);

/**
 * Shopping list: check items off as you shop (persisted per recipe), export
 * (copy / download / email), and a keyless store locator by ZIP.
 */
export function ShoppingList({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  // Email
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  // Stores
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `ember-shop-${slug(title)}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) setChecked(new Set(saved as number[]));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  function clearChecks() {
    setChecked(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  const listText = `Shopping list — ${title}\n\n${items.map((i) => `☐ ${i}`).join('\n')}\n\n— via TastyEmber`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(listText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed — select the list manually.');
    }
  }
  function download() {
    const blob = new Blob([listText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopping-list-${slug(title)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailList(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await shoppingApi.email({ title, items, to: emailTo.trim() || undefined });
      setEmailMsg(
        res.delivered
          ? `Sent to ${res.sent} ${res.sent === 1 ? 'inbox' : 'inboxes'}. ${emailTo.trim() ? '' : 'Check your email.'}`.trim()
          : "Prepared — but this site's email delivery isn't turned on yet.",
      );
      setEmailTo('');
    } catch (err) {
      setEmailMsg(err instanceof ApiError ? err.message : 'Could not email the list. Try again.');
    } finally {
      setEmailBusy(false);
    }
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
  const smallInput: React.CSSProperties = { border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink };
  const gathered = checked.size;

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
          {/* Check off as you shop */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Check off as you shop</div>
            <div style={{ fontSize: 11.5, color: C.muted65, fontWeight: 700 }}>
              {gathered}/{items.length}
              {gathered > 0 && (
                <button onClick={clearChecks} style={{ background: 'none', border: 'none', color: C.rust, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginLeft: 8 }}>reset</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
            {items.map((it, i) => {
              const on = checked.has(i);
              return (
                <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.4, cursor: 'pointer', color: on ? C.muted55 : C.ink }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} style={{ marginTop: 2, accentColor: C.green, flex: 'none' }} />
                  <span style={{ textDecoration: on ? 'line-through' : 'none' }}>{it}</span>
                </label>
              );
            })}
          </div>

          {/* Export */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <button onClick={copy} style={pill}>{copied ? '✓ Copied' : '📋 Copy'}</button>
            <button onClick={download} style={pill}>⬇ Download</button>
            <button onClick={() => { setEmailOpen((o) => !o); setEmailMsg(null); }} style={pill}>✉ Email list</button>
          </div>

          {emailOpen && (
            <form onSubmit={emailList} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="Email address (blank = send to me)" style={{ ...smallInput, width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="submit" disabled={emailBusy} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 18px', borderRadius: 999, border: 'none', cursor: emailBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {emailBusy && <Spinner size={13} color="#fff" />}Send list
                </button>
                {emailMsg && <span style={{ fontSize: 12, color: emailMsg.toLowerCase().includes('could') || emailMsg.toLowerCase().includes("isn't") ? C.error : C.green, fontWeight: 600 }}>{emailMsg}</span>}
              </div>
            </form>
          )}

          {/* Store locator */}
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, margin: '18px 0 8px', borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>Find stores near you</div>
          <form onSubmit={findStores} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null); }} inputMode="numeric" placeholder="ZIP code" style={{ ...smallInput, fontFamily: mono, width: 120 }} />
            <button type="submit" disabled={busy} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {busy && <Spinner size={14} color="#fff" />}Find stores
            </button>
          </form>
          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{error}</div>}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Grocery stores near {result.location.city}, {result.location.state}</div>
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
                <div style={{ fontSize: 12.5, color: C.muted65 }}>No stores in the map data for that area — use the map link below.</div>
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
