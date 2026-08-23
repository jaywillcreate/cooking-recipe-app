'use client';
import { useMemo, useState } from 'react';
import { storesApi, ApiError, type StoreResult, type Store } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { estimateBasketAt } from '@/lib/basket';
import { Spinner } from './Spinner';
import { IconPin, IconSort, IconStore, IconExternal } from './icons';

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

/**
 * ZIP → nearby grocery stores on a map, each priced for the caller's basket by
 * the store's price tier. Shared by the single-recipe list and the week list,
 * which differ only in how the basket was assembled.
 */
export function StoreFinder({ base, itemCount }: { base: number; itemCount: number }) {
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'price'>('distance');

  const minTotal = useMemo(
    () => (result ? Math.min(...result.stores.map((s) => estimateBasketAt(base, s.priceTier)), Infinity) : Infinity),
    [result, base],
  );

  const sortedStores = useMemo<Store[]>(() => {
    if (!result) return [];
    const list = [...result.stores];
    if (sortBy === 'price') list.sort((a, b) => estimateBasketAt(base, a.priceTier) - estimateBasketAt(base, b.priceTier) || a.distanceMi - b.distanceMi);
    else list.sort((a, b) => a.distanceMi - b.distanceMi);
    return list;
  }, [result, sortBy, base]);

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

  const inputStyle: React.CSSProperties = { border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink };
  const mapSrc = result ? `https://www.openstreetmap.org/export/embed.html?bbox=${result.location.lon - 0.055},${result.location.lat - 0.04},${result.location.lon + 0.055},${result.location.lat + 0.04}&layer=mapnik&marker=${result.location.lat},${result.location.lon}` : '';

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <IconPin size={16} color={C.rust} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Nearby stores</span>
      </div>
      <form onSubmit={findStores} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null); }} inputMode="numeric" placeholder="ZIP code" aria-label="ZIP code" style={{ ...inputStyle, fontFamily: mono, width: 110 }} />
        <button type="submit" disabled={busy} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
          {busy && <Spinner size={14} color="#fff" />}Find stores
        </button>
      </form>
      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{error}</div>}
      {!result && !busy && <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted55, lineHeight: 1.5 }}>Enter your ZIP to see nearby grocery stores on a map, sortable by distance or estimated price.</div>}

      {result && (
        <div style={{ marginTop: 14 }}>
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
                const av = brandColor(s.name, TIER_COLOR[s.priceTier]!);
                return (
                  <a key={i} href={s.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: '#fff', border: `1.5px solid ${lowest ? C.green : C.line}`, borderRadius: 12, textDecoration: 'none' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: av, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconStore size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 0 }}>
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: TIER_COLOR[s.priceTier] }}>{s.priceLabel}</span>
                        {lowest && <span style={{ flex: 'none', fontSize: 10, fontWeight: 800, color: '#fff', background: C.green, borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lowest</span>}
                        {s.address && <span style={{ fontSize: 11.5, color: C.muted55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.address}</span>}
                      </div>
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
            Totals are a rough estimate for these {itemCount} items, adjusted by each store&apos;s price level — not live item prices.
          </div>
          <a href={result.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: C.rust }}>Open all in Maps <IconExternal size={13} /></a>
        </div>
      )}
    </div>
  );
}
