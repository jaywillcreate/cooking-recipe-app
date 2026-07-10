'use client';
import { useEffect, useMemo, useState } from 'react';
import { storesApi, shoppingApi, ApiError, type StoreResult, type Store } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';
import { IconCart, IconStore, IconCheck, IconCopy, IconDownload, IconMail, IconPin, IconSort, IconExternal } from './icons';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
const TIER_COLOR: Record<number, string> = { 1: C.green, 2: C.goldText, 3: C.rust };

export function ShoppingList({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'price'>('distance');

  const storageKey = `ember-shop-${slug(title)}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) setChecked(new Set(saved as number[]));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function persist(next: Set<number>) {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      persist(next);
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
  const gathered = checked.size;
  const pct = items.length ? Math.round((gathered / items.length) * 100) : 0;

  const sortedStores = useMemo<Store[]>(() => {
    if (!result) return [];
    const list = [...result.stores];
    if (sortBy === 'price') list.sort((a, b) => a.priceTier - b.priceTier || a.distanceMi - b.distanceMi);
    else list.sort((a, b) => a.distanceMi - b.distanceMi);
    return list;
  }, [result, sortBy]);

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
      setEmailMsg(res.delivered ? `Sent${emailTo.trim() ? '' : ' to your inbox'} ✓` : "Email delivery isn't turned on for this site yet.");
      setEmailTo('');
    } catch (err) {
      setEmailMsg(err instanceof ApiError ? err.message : 'Could not email the list.');
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

  const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1.5px solid ${C.line}`, color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' };
  const inputStyle: React.CSSProperties = { border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink };
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted55 };

  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: C.dark, color: C.bg, fontWeight: 800, fontSize: 13.5, padding: '14px 18px', borderRadius: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <IconCart size={18} color={C.gold} />
        <span style={{ flex: 1, textAlign: 'left' }}>Shopping list &amp; stores</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', fontSize: 12, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', animation: 'emberFade 0.2s ease' }}>
          {/* Header + progress */}
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(196,85,45,0.12)', color: C.rust, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconCart size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Your shopping list</div>
                  <div style={{ fontSize: 11.5, color: C.muted55 }}>{gathered} of {items.length} gathered</div>
                </div>
              </div>
              {gathered > 0 && (
                <button onClick={clearChecks} style={{ background: 'none', border: 'none', color: C.rust, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
              )}
            </div>
            <div style={{ height: 7, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: C.green, borderRadius: 999, transition: 'width .25s ease' }} />
            </div>
          </div>

          {/* Checklist */}
          <div style={{ padding: '6px 20px' }}>
            {items.map((it, i) => {
              const on = checked.has(i);
              return (
                <label key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: i < items.length - 1 ? `1px solid ${C.line}` : 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                  <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', border: on ? 'none' : `2px solid ${C.line22}`, background: on ? C.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                    {on && <IconCheck size={14} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.35, color: on ? C.muted55 : C.ink, textDecoration: on ? 'line-through' : 'none' }}>{it}</span>
                </label>
              );
            })}
          </div>

          {/* Export actions */}
          <div style={{ padding: '14px 20px', background: C.bg, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={copy} style={actionBtn}>{copied ? <IconCheck size={15} color={C.green} /> : <IconCopy size={15} />}{copied ? 'Copied' : 'Copy'}</button>
            <button onClick={download} style={actionBtn}><IconDownload size={15} />Download</button>
            <button onClick={() => { setEmailOpen((o) => !o); setEmailMsg(null); }} style={{ ...actionBtn, ...(emailOpen ? { borderColor: C.rust, color: C.rust } : {}) }}><IconMail size={15} />Email</button>
          </div>

          {emailOpen && (
            <form onSubmit={emailList} style={{ padding: '0 20px 16px', background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="Email address — leave blank to send to yourself" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="submit" disabled={emailBusy} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 18px', borderRadius: 999, border: 'none', cursor: emailBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {emailBusy && <Spinner size={13} color="#fff" />}Send list
                </button>
                {emailMsg && <span style={{ fontSize: 12, color: emailMsg.includes('✓') ? C.green : C.error, fontWeight: 600 }}>{emailMsg}</span>}
              </div>
            </form>
          )}

          {/* Store locator */}
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <IconPin size={16} color={C.rust} />
              <span style={sectionLabel}>Find stores near you</span>
            </div>
            <form onSubmit={findStores} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null); }} inputMode="numeric" placeholder="ZIP code" style={{ ...inputStyle, fontFamily: mono, width: 120 }} />
              <button type="submit" disabled={busy} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {busy && <Spinner size={14} color="#fff" />}Find stores
              </button>
            </form>
            {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{error}</div>}

            {result && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Near {result.location.city}, {result.location.state}</div>
                  {result.stores.length > 1 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bg, borderRadius: 999, padding: 3 }}>
                      <IconSort size={13} color={C.muted55} style={{ marginLeft: 6 }} />
                      {(['distance', 'price'] as const).map((k) => (
                        <button key={k} onClick={() => setSortBy(k)} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: sortBy === k ? C.dark : 'transparent', color: sortBy === k ? '#fff' : C.muted65 }}>
                          {k === 'distance' ? 'Nearest' : 'Cheapest'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {sortedStores.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedStores.map((s, i) => (
                      <a key={i} href={s.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, textDecoration: 'none' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, flex: 'none', background: `${TIER_COLOR[s.priceTier]}1f`, color: TIER_COLOR[s.priceTier], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconStore size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <span title="Estimated price level" style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: TIER_COLOR[s.priceTier], background: `${TIER_COLOR[s.priceTier]}1f`, borderRadius: 6, padding: '1px 6px' }}>{s.priceLabel}</span>
                          </div>
                          {s.address && <div style={{ fontSize: 11.5, color: C.muted55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted65 }}>{s.distanceMi} mi</span>
                          <IconExternal size={14} color={C.muted55} />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.muted65 }}>No stores in the map data for that area — use the map link below.</div>
                )}

                <div style={{ fontSize: 11, color: C.muted55, marginTop: 10, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>$/$$/$$$</span> is an estimated price level based on the store chain, not live item prices.
                </div>
                <a href={result.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: C.rust }}>
                  Open all in Maps <IconExternal size={13} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
