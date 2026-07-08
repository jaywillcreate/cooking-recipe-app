'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Recipe } from '@/lib/types';
import { C, mono } from '@/lib/tokens';
import { cookbookApi } from '@/lib/api';
import { useApp } from '@/lib/store';
import { RecipeThumb } from './RecipeThumb';

/** Discover/Cookbook recipe card (photo, cuisine, tags, save toggle, title, meta). */
export function RecipeCard({
  r,
  thumbHeight = 130,
  rightLabel,
  showTags = false,
  showSaveToggle = false,
}: {
  r: Recipe;
  thumbHeight?: number;
  rightLabel?: string;
  showTags?: boolean;
  showSaveToggle?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(r.saved);
  const [busy, setBusy] = useState(false);

  async function toggleSave(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = saved ? await cookbookApi.unsave(r.id) : await cookbookApi.save(r.id);
      setSaved(res.saved);
      useApp.getState().setSavedCount(res.count);
    } finally {
      setBusy(false);
    }
  }

  const topTags = (r.tags || []).slice(0, 3);

  return (
    <div
      className="ember-card"
      onClick={() => router.push(`/recipe/${r.id}`)}
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        borderTop: `4px solid ${r.accent}`,
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative' }}>
        <RecipeThumb recipe={r} height={thumbHeight} />
        {showSaveToggle && (
          <button
            onClick={toggleSave}
            title={saved ? 'In your cookbook — click to remove' : 'Save to cookbook'}
            aria-label={saved ? 'Remove from cookbook' : 'Save to cookbook'}
            style={{
              position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: saved ? C.green : 'rgba(255,255,255,0.92)', boxShadow: '0 1px 4px rgba(0,0,0,.18)',
            }}
          >
            <BookmarkIcon filled={saved} color={saved ? '#fff' : C.ink} />
          </button>
        )}
      </div>
      <div style={{ padding: '15px 17px 17px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: r.accent }}>
            {r.cuisine}
          </span>
          <span style={{ fontSize: 11, fontFamily: mono, color: 'rgba(36,26,18,0.5)' }}>
            {rightLabel ?? r.sourceLabel}
          </span>
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.22, letterSpacing: -0.3, marginBottom: 7 }}>
          {r.title}
        </div>
        {showTags && topTags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
            {topTags.map((t) => (
              <span key={t} style={{ fontSize: 10.5, fontWeight: 600, color: C.muted65, background: 'rgba(36,26,18,0.06)', padding: '3px 9px', borderRadius: 999 }}>
                #{t}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{r.meta}</div>
      </div>
    </div>
  );
}

function BookmarkIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
