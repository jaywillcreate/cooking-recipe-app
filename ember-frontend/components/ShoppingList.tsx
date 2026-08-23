'use client';
import { useEffect, useMemo, useState } from 'react';
import { shoppingApi, ApiError } from '@/lib/api';
import { C } from '@/lib/tokens';
import { estimateBasketBase, estimateBasketAt } from '@/lib/basket';
import { Spinner } from './Spinner';
import { StoreFinder } from './StoreFinder';
import { IconCart, IconCheck, IconCopy, IconDownload, IconMail } from './icons';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);

export function ShoppingList({ title, items, factor = 1 }: { title: string; items: string[]; factor?: number }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
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
  const gathered = checked.size;
  const pct = items.length ? Math.round((gathered / items.length) * 100) : 0;
  // Scale the estimate by the serving factor (buying ~N× more of everything).
  const base = useMemo(() => estimateBasketBase(items) * factor, [items, factor]);

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

  const tile: React.CSSProperties = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 };
  const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1.5px solid ${C.line}`, color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' };
  const inputStyle: React.CSSProperties = { border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink };

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

        {/* Right: store locator, priced for this basket */}
        <StoreFinder base={base} itemCount={items.length} />
      </div>
    </div>
  );
}
