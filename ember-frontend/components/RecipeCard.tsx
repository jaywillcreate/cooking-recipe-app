'use client';
import { useRouter } from 'next/navigation';
import type { Recipe } from '@/lib/types';
import { C, mono } from '@/lib/tokens';
import { RecipeThumb } from './RecipeThumb';

/** Discover/Cookbook recipe card (photo, cuisine, source/collections, title, meta). */
export function RecipeCard({
  r,
  thumbHeight = 130,
  rightLabel,
}: {
  r: Recipe;
  thumbHeight?: number;
  rightLabel?: string;
}) {
  const router = useRouter();
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
      }}
    >
      <RecipeThumb recipe={r} height={thumbHeight} />
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
        <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{r.meta}</div>
      </div>
    </div>
  );
}
