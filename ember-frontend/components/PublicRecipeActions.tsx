'use client';
import { useState } from 'react';
import { C, mono } from '@/lib/tokens';
import { IconCheck, IconCopy, IconShare } from './icons';

/**
 * Share controls on the public recipe page. Uses the platform share sheet
 * where the browser has one (phones, Safari) and falls back to copy-to-
 * clipboard everywhere else — the universal fallback every share pattern needs.
 */
export function PublicRecipeActions({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the URL is in the address bar anyway */
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: `${title} — on TastyEmber`, url });
        return;
      } catch {
        return; // user dismissed the sheet
      }
    }
    void copy();
  }

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, background: C.surface,
    border: `1.5px solid ${C.line22}`, color: C.ink, fontWeight: 700, fontSize: 12.5,
    padding: '9px 15px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 18 }}>
      <button onClick={share} style={btn}>
        <IconShare size={15} />
        Share
      </button>
      <button onClick={copy} style={{ ...btn, ...(copied ? { borderColor: C.green, color: C.green } : {}) }}>
        {copied ? <IconCheck size={15} color={C.green} /> : <IconCopy size={15} />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted55, letterSpacing: 0.3 }} aria-hidden>
        {url.replace(/^https?:\/\//, '')}
      </span>
    </div>
  );
}
