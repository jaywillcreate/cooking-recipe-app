'use client';
import { useEffect, useState } from 'react';
import { shareApi, ApiError } from '@/lib/api';
import type { ShareState } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';
import { IconCheck, IconCopy, IconGlobe, IconLock, IconShare } from './icons';

/**
 * Share control on the recipe detail page. Publishing mints a public /r/<slug>
 * page anyone can open; everything else about the recipe — saves, collections,
 * tags, plans — stays private, and the cook can stop sharing at any time.
 */
export function ShareRecipe({ recipeId, title }: { recipeId: string; title: string }) {
  const [state, setState] = useState<ShareState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    shareApi
      .get(recipeId)
      .then((s) => live && setState(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [recipeId]);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const next = await shareApi.publish(recipeId);
      setState(next);
      setOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the link — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setError(null);
    try {
      setState(await shareApi.unpublish(recipeId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop sharing — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!state?.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed — select the link and copy it manually.');
    }
  }

  async function nativeShare() {
    if (!state?.url) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: `${title} — on TastyEmber`, url: state.url });
      } catch {
        /* dismissed */
      }
      return;
    }
    void copy();
  }

  const live = state?.isPublic && state.url;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={() => (live ? setOpen((o) => !o) : void publish())}
        disabled={busy}
        style={{
          fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
          padding: '11px 24px', borderRadius: 999, border: `1.5px solid ${live ? C.green : C.line22}`,
          background: 'none', color: live ? C.green : C.ink,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {busy ? <Spinner size={14} color={C.muted} /> : live ? <IconGlobe size={15} /> : <IconShare size={15} />}
        {live ? 'Shared · link' : 'Share recipe'}
      </button>

      {open && live && (
        <div style={{ padding: '14px 16px', background: C.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: C.green }}>
            <IconGlobe size={14} />
            Public link is live
          </div>
          <div
            style={{
              fontFamily: mono, fontSize: 11.5, color: C.muted75, background: C.surface,
              border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px',
              wordBreak: 'break-all', lineHeight: 1.4,
            }}
          >
            {state!.url}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={copy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: copied ? C.green : C.dark, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {copied ? <IconCheck size={14} color="#fff" /> : <IconCopy size={14} color="#fff" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={nativeShare}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', color: C.ink, fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 999, border: `1.5px solid ${C.line22}`, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <IconShare size={14} />
              Share…
            </button>
            <a
              href={state!.url!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.rust, fontWeight: 700, fontSize: 12.5, padding: '9px 4px', textDecoration: 'none' }}
            >
              Preview
            </a>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted55, lineHeight: 1.5, display: 'flex', gap: 7 }}>
            <IconLock size={13} style={{ marginTop: 1, opacity: 0.7 }} />
            <span>Anyone with the link can read the recipe. Your cookbook, tags, plans and shopping list stay private.</span>
          </div>
          <button
            onClick={unpublish}
            disabled={busy}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: C.rust, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            Stop sharing
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
