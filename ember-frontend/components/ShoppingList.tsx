'use client';
import { useEffect, useMemo, useState } from 'react';
import { storesApi, shoppingApi, ApiError, type StoreResult, type Store } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { estimateBasketBase, estimateBasketAt } from '@/lib/basket';
import { Spinner } from './Spinner';
import { IconCart, IconStore, IconCheck, IconCopy, IconDownload, IconMail, IconPin, IconSort, IconExternal } from './icons';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
const TIER_COLOR: Record<number, string> = { 1: C.green, 2: C.goldText, 3: C.rust };

// Brand colors for recognizable chains (adds visual interest to store avatars).
const BRAND: { re: RegExp; color: string }[] = [
  { re: /whole foods/i, color: '#00674b' }, { re: /trader joe/i, color: '#b8232f' },
  { re: /aldi/i, color: '#009cda' }, { re: /kroger|ralphs|fry'?s|king soopers|harris teeter/i, color: '#0a4595' },
  { re: /safeway|vons|pavilions/i, color: '#e01a2b' }, { re: /albertsons/i, color: '#0a68b1' },
  { re: /publix/i, color: '#2a7d2e' }, { re: /costco/i, color: '#e31837' }, { re: /walmart/i, color: '#0071ce' },
  { re: /sprouts/i, color: '#7ab800' }, { re: /gelson/i, color: '#6a4a9c' }, { re: /erewhon/i, color: '#2b2b2b' },
  { re: /wegmans/i, color: '#c8102e' }, { re: /h-?e-?b/i, color: '#e2231a' }, { re: /lidl/i, color: '#0050aa' },
  { re: /sam'?s club/i, color: '#0067a0' }, { re: /grocery outlet/i, color: '#e4002b' }, { re: /sprout/i, color: '#7ab800' },
];
const brandColor = (name: string, fallback: string) => BRAND.find((b) => b.re.test(name))?.color ?? fallback;

export function ShoppingList({ title, items }: { title: string; items: string[] }) {
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
  const gathered = checked.size;
  const pct = items.length ? Math.round((gathered / items.length) * 100) : 0;
  const base = useMemo(() => estimateBasketBase(items), [items]);
  const minTotal = useMemo(() => (result ? Math.min(...result.stores.map((s) => estimateBasketAt(base, s.priceTier)), Infinity) : Infinity), [result, base]);

  const sortedStores = useMemo<Store[]>(() => {
    if (!result) return [];
    const list = [...result.stores];
    if (sortBy === 'price') list.sort((a, b) => estimateBasketAt(base, a.priceTier) - estimateBasketAt(base, b.priceTier) || a.distanceMi - b.distanceMi);
    else list.sort((a, b) => a.distanceMi - b.distanceMi);
    return list;
  }, [result, sortBy, base]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(listText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed.');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([listText], { type: 'text/plain' }));
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
      setError(err instanceof ApiError ? err.message : "Couldn't look up stores. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const tile: React.CSSProperties = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 };
  const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1.5px solid ${C.line}`, color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' };
  const inputStyle: React.CSSProperties = { border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink };
  const mapSrc = result ? `https://www.openstreetmap.org/export/embed.html?bbox=${result.location.lon - 0.055},${result.location.lat - 0.04},${result.location.lon + 0.055},${result.location.lat + 0.04}&layer=mapnik&marker=${result.location.lat},${result.location.lon}` : '';

  return (
    <div>
      {/* Bento stat hero: dynamic, prominent basket estimate + progress */}
      <div className="shop-stats" style={{ marginBottom: 16 }}>
        <div style={{ ...tile, background: 'linear-gradient(135deg, #c4552d, #a8461f)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IconCart size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffd9a3' }}>Estimated basket</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>~${estimateBasketAt(base, 2)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>{items.length} items · ${estimateBasketAt(base, 1)}–${estimateBasketAt(base, 3)} by store</div>
          </div>
        </div>
        <div style={{ ...tile, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>{gathered}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.muted55 }}> / {items.length}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Gathered</div>
          </div>
          <div style={{ height: 8, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: C.green, borderRadius: 999, transition: 'width .3s ease' }} />
          </div>
          {gathered > 0 && <button onClick={clearChecks} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: C.rust, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Reset</button>}
        </div>
      </div>

      {/* Balanced two-column body */}
      <div className="shop-grid">
        {/* Left: checklist + export */}
        <div style={{ ...tile, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 4px', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Check off as you shop</div>
          <div style={{ padding: '0 18px' }}>
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
          <div style={{ padding: '14px 18px', background: C.bg, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button onClick={copy} style={actionBtn}>{copied ? <IconCheck size={15} color={C.green} /> : <IconCopy size={15} />}{copied ? 'Copied' : 'Copy'}</button>
            <button onClick={download} style={actionBtn}><IconDownload size={15} />Download</button>
            <button onClick={() => { setEmailOpen((o) => !o); setEmailMsg(null); }} style={{ ...actionBtn, ...(emailOpen ? { borderColor: C.rust, color: C.rust } : {}) }}><IconMail size={15} />Email</button>
          </div>
          {emailOpen && (
            <form onSubmit={emailList} style={{ padding: '0 18px 16px', background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="Email address — blank = send to yourself" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" disabled={emailBusy} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 18px', borderRadius: 999, border: 'none', cursor: emailBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {emailBusy && <Spinner size={13} color="#fff" />}Send list
                </button>
                {emailMsg && <span style={{ fontSize: 12, color: emailMsg.includes('✓') ? C.green : C.error, fontWeight: 600 }}>{emailMsg}</span>}
              </div>
            </form>
          )}
        </div>

        {/* Right: store locator */}
        <div style={tile}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <IconPin size={16} color={C.rust} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Nearby stores</span>
          </div>
          <form onSubmit={findStores} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null); }} inputMode="numeric" placeholder="ZIP code" style={{ ...inputStyle, fontFamily: mono, width: 110 }} />
            <button type="submit" disabled={busy} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {busy && <Spinner size={14} color="#fff" />}Find stores
            </button>
          </form>
          {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{error}</div>}
          {!result && !busy && <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted55, lineHeight: 1.5 }}>Enter your ZIP to see nearby grocery stores on a map, sortable by distance or estimated price.</div>}

          {result && (
            <div style={{ marginTop: 14 }}>
              {/* Map visual */}
              <iframe src={mapSrc} title={`Map near ${result.location.city}`} loading="lazy" style={{ width: '100%', height: 170, border: `1px solid ${C.line}`, borderRadius: 12, display: 'block' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '14px 0 12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{result.location.city}, {result.location.state}</div>
                {result.stores.length > 1 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bg, borderRadius: 999, padding: 3 }}>
                    <IconSort size={13} color={C.muted55} style={{ marginLeft: 6 }} />
                    {(['distance', 'price'] as const).map((k) => (
                      <button key={k} onClick={() => setSortBy(k)} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: sortBy === k ? C.dark : 'transparent', color: sortBy === k ? '#fff' : C.muted65 }}>{k === 'distance' ? 'Nearest' : 'Cheapest'}</button>
                    ))}
                  </div>
                )}
              </div>

              {sortedStores.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedStores.map((s, i) => {
                    const total = estimateBasketAt(base, s.priceTier);
                    const lowest = total === minTotal;
                    const av = brandColor(s.name, TIER_COLOR[s.priceTier]);
                    return (
                      <a key={i} href={s.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: '#fff', border: `1.5px solid ${lowest ? C.green : C.line}`, borderRadius: 12, textDecoration: 'none' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconStore size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: TIER_COLOR[s.priceTier] }}>{s.priceLabel}</span>
                            {lowest && <span style={{ flex: 'none', fontSize: 10, fontWeight: 800, color: '#fff', background: C.green, borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lowest</span>}
                          </div>
                          {s.address && <div style={{ fontSize: 11.5, color: C.muted55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: lowest ? C.green : C.ink }}>~${total}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted55, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{s.distanceMi} mi <IconExternal size={11} color={C.muted55} /></span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: C.muted65 }}>No stores in the map data for that area — use the map link below.</div>
              )}

              <div style={{ fontSize: 11, color: C.muted55, marginTop: 10, lineHeight: 1.5 }}>
                Totals are a rough estimate for these {items.length} items, adjusted by each store&apos;s price level — not live item prices.
              </div>
              <a href={result.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: C.rust }}>Open all in Maps <IconExternal size={13} /></a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
