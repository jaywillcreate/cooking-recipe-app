'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mealPlanApi, shoppingApi, ApiError, type WeekListItem, type WeekListResponse } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { estimateBasketBase, estimateBasketAt } from '@/lib/basket';
import { Spinner } from './Spinner';
import { StoreFinder } from './StoreFinder';
import { IconCart, IconCheck, IconCopy, IconDownload, IconList, IconMail, IconRefresh } from './icons';

/**
 * The week's plan as one shop. Every planned recipe's ingredients are merged
 * server-side — duplicates summed, aisles assigned, staples flagged — and this
 * renders them in store-walk order with the whole week priced by the basket
 * estimator, so the answer to "what does this week cost" is on screen before
 * the trip.
 *
 * `reloadKey` changes whenever the plan changes so the list never drifts from
 * the calendar above it.
 */
export function WeekShoppingList({ start, end, reloadKey }: { start: string; end: string; reloadKey: number }) {
  const [data, setData] = useState<WeekListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showOnHand, setShowOnHand] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const storageKey = `ember-week-shop-${start}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await mealPlanApi.shoppingList(start, end));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build this week's list — try again.");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  // Check-off state is per week and survives a reload — you shop over hours.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setChecked(new Set(Array.isArray(saved) ? (saved as string[]) : []));
    } catch {
      setChecked(new Set());
    }
  }, [storageKey]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  const buyItems = useMemo(() => (data ? data.groups.flatMap((g) => g.items) : []), [data]);
  const base = useMemo(() => estimateBasketBase(buyItems.map((i) => i.name)), [buyItems]);
  const gathered = buyItems.filter((i) => checked.has(i.id)).length;
  const pct = buyItems.length ? Math.round((gathered / buyItems.length) * 100) : 0;

  const listLines = useMemo(
    () =>
      data
        ? data.groups.flatMap((g) => [`— ${g.label.toUpperCase()} —`, ...g.items.map((i) => `☐ ${line(i)}`), ''])
        : [],
    [data],
  );
  const listText = `Shopping list — week of ${start}\n\n${listLines.join('\n')}\n— via TastyEmber`;

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
    a.download = `shopping-list-week-${start}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailList(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await shoppingApi.email({
        title: `Your week — ${start} to ${end}`,
        items: listLines.filter(Boolean),
        to: emailTo.trim() || undefined,
      });
      setEmailMsg(res.delivered ? `Sent${emailTo.trim() ? '' : ' to your inbox'} ✓` : "Email delivery isn't turned on for this site yet.");
      setEmailTo('');
    } catch (err) {
      setEmailMsg(err instanceof ApiError ? err.message : 'Could not email the list.');
    } finally {
      setEmailBusy(false);
    }
  }

  const tile: React.CSSProperties = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 };
  const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1.5px solid ${C.line}`, color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' };

  if (loading && !data) {
    return (
      <div style={{ ...tile, display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ ...tile, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: C.error, fontWeight: 600 }}>{error}</span>
        <button onClick={() => void load()} style={actionBtn}><IconRefresh size={14} />Try again</button>
      </div>
    );
  }

  if (!data) return null;

  // Nothing planned yet — say what to do, don't show an empty checklist.
  if (data.counts.recipes === 0) {
    return (
      <div style={{ ...tile, textAlign: 'center', padding: '34px 22px' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <IconList size={22} color={C.muted55} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>No recipes planned this week yet</div>
        <div style={{ fontSize: 13, color: C.muted65, marginTop: 6, lineHeight: 1.5, maxWidth: '46ch', margin: '6px auto 0' }}>
          Plan a saved recipe into any slot above and its ingredients roll into one list here — duplicates merged, sorted by aisle, priced for the week.
        </div>
        {data.unplanned.length > 0 && (
          <div style={{ fontSize: 12, color: C.muted55, marginTop: 12 }}>
            {data.unplanned.length} typed-in {data.unplanned.length === 1 ? 'meal has' : 'meals have'} no recipe attached, so there&apos;s nothing to shop for.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Stat hero — the week's cost and progress, the two things you scan for */}
      <div className="week-shop-stats" style={{ marginBottom: 16 }}>
        <div style={{ ...tile, background: 'linear-gradient(135deg, #c4552d, #a8461f)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IconCart size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#ffd9a3' }}>Estimated for the week</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>~${estimateBasketAt(base, 2)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
              {buyItems.length} items · {data.counts.recipes} {data.counts.recipes === 1 ? 'recipe' : 'recipes'} · ${estimateBasketAt(base, 1)}–${estimateBasketAt(base, 3)} by store
            </div>
          </div>
        </div>
        <div style={{ ...tile, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>{gathered}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.muted55 }}> / {buyItems.length}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Gathered</div>
          </div>
          <div style={{ height: 8, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: C.green, borderRadius: 999, transition: 'width .3s ease' }} />
          </div>
          {gathered > 0 && (
            <button onClick={clearChecks} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: C.rust, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Reset</button>
          )}
        </div>
      </div>

      <div className="week-shop-grid">
        {/* Left: the aisle-sorted list */}
        <div style={{ ...tile, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Sorted by aisle</span>
            {loading && <Spinner size={14} color={C.muted55} />}
          </div>

          {data.groups.map((group) => (
            <section key={group.key}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
                  background: C.bg, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: C.goldText }}>{group.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted55 }}>{group.items.length}</span>
              </div>
              <div style={{ padding: '2px 18px' }}>
                {group.items.map((item, i) => {
                  const on = checked.has(item.id);
                  return (
                    <label
                      key={item.id}
                      style={{
                        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0',
                        borderBottom: i < group.items.length - 1 ? `1px solid ${C.line}` : 'none', cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(item.id)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                      <span
                        aria-hidden
                        style={{
                          width: 22, height: 22, borderRadius: '50%', flex: 'none', marginTop: 1,
                          border: on ? 'none' : `2px solid ${C.line22}`, background: on ? C.green : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                        }}
                      >
                        {on && <IconCheck size={14} color="#fff" strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 600, color: on ? C.muted55 : C.ink, textDecoration: on ? 'line-through' : 'none' }}>
                            {item.name}
                          </span>
                          {item.quantity && (
                            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: on ? C.muted55 : C.muted75, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                              {item.quantity}
                            </span>
                          )}
                        </span>
                        {/* Provenance: which meals need it, so a cut recipe is easy to trace */}
                        <span style={{ display: 'block', fontSize: 11.5, color: C.muted55, marginTop: 3, lineHeight: 1.35 }}>
                          {item.recipes.join(' · ')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Staples the cook already keeps — shown, not silently removed */}
          {data.onHand.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.line}` }}>
              <button
                onClick={() => setShowOnHand((v) => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: C.green }}>Already in your kitchen</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted55 }}>{data.onHand.length}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.rust }}>{showOnHand ? 'Hide' : 'Show'}</span>
              </button>
              {showOnHand && (
                <div style={{ padding: '0 18px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                    {data.onHand.map((item) => (
                      <span key={item.id} style={{ fontSize: 12, fontWeight: 600, color: C.green, background: 'rgba(47,122,77,0.1)', borderRadius: 999, padding: '5px 11px' }}>
                        {item.name}
                        {item.quantity ? ` · ${item.quantity}` : ''}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted55, lineHeight: 1.5 }}>
                    Left off the list and out of the estimate because they match your staples ({data.pantryTerms.join(', ')}). Edit those under Preferences.
                  </div>
                </div>
              )}
            </div>
          )}

          {data.unplanned.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.muted55, lineHeight: 1.5 }}>
              {data.unplanned.length} typed-in {data.unplanned.length === 1 ? 'meal' : 'meals'} ({data.unplanned.map((u) => u.title).join(', ')}) {data.unplanned.length === 1 ? 'has' : 'have'} no recipe attached, so nothing was added for {data.unplanned.length === 1 ? 'it' : 'them'}.
            </div>
          )}

          <div style={{ padding: '14px 18px', background: C.bg, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={copy} style={actionBtn}>{copied ? <IconCheck size={15} color={C.green} /> : <IconCopy size={15} />}{copied ? 'Copied' : 'Copy'}</button>
            <button onClick={download} style={actionBtn}><IconDownload size={15} />Download</button>
            <button onClick={() => { setEmailOpen((o) => !o); setEmailMsg(null); }} style={{ ...actionBtn, ...(emailOpen ? { borderColor: C.rust, color: C.rust } : {}) }}><IconMail size={15} />Email</button>
          </div>
          {emailOpen && (
            <form onSubmit={emailList} style={{ padding: '0 18px 16px', background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="Email address — blank = send to yourself" aria-label="Email address" style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" disabled={emailBusy} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 18px', borderRadius: 999, border: 'none', cursor: emailBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {emailBusy && <Spinner size={13} color="#fff" />}Send list
                </button>
                {emailMsg && <span style={{ fontSize: 12, color: emailMsg.includes('✓') ? C.green : C.error, fontWeight: 600 }}>{emailMsg}</span>}
              </div>
            </form>
          )}
        </div>

        {/* Right: price the whole week at real nearby stores */}
        <StoreFinder base={base} itemCount={buyItems.length} />
      </div>
    </div>
  );
}

/** "2 lb · 3 cloves Garlic" for the plain-text exports. */
function line(item: WeekListItem): string {
  return item.quantity ? `${item.quantity} ${item.name}` : item.name;
}
