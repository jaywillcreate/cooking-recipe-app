'use client';
import { useState } from 'react';
import { recipeApi } from '@/lib/api';
import { C } from '@/lib/tokens';

/**
 * 5-star rating for a recipe. Shown ONLY on the recipe detail page (never on
 * grid cards). Hover previews on desktop; tap to rate; re-rating replaces the
 * previous rating. Shows the community average + count once ratings exist.
 */
export function StarRating({
  recipeId,
  initialMine = 0,
  initialAvg = null,
  initialCount = 0,
}: {
  recipeId: string;
  initialMine?: number;
  initialAvg?: number | null;
  initialCount?: number;
}) {
  const [mine, setMine] = useState(initialMine);
  const [avg, setAvg] = useState<number | null>(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);

  async function rate(stars: number) {
    if (busy) return;
    setBusy(true);
    const prev = mine;
    setMine(stars);
    try {
      const res = await recipeApi.rate(recipeId, stars);
      setAvg(res.starsAvg);
      setCount(res.starsCount);
      setThanks(true);
      setTimeout(() => setThanks(false), 2200);
    } catch {
      setMine(prev); // roll back on failure
    } finally {
      setBusy(false);
    }
  }

  const display = hover || mine;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div role="radiogroup" aria-label="Rate this recipe" style={{ display: 'inline-flex', gap: 1 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={mine === s}
            aria-label={`${s} star${s > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(s)}
            onFocus={() => setHover(s)}
            onBlur={() => setHover(0)}
            onClick={() => rate(s)}
            disabled={busy}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 1px',
              fontSize: 20, lineHeight: 1,
              color: s <= display ? C.gold : C.line22,
              transform: hover === s ? 'scale(1.15)' : 'none',
              transition: 'color .12s, transform .12s',
            }}
          >
            {s <= display ? '★' : '☆'}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: C.muted55, fontWeight: 600 }}>
        {thanks ? (
          <span style={{ color: C.green, fontWeight: 700 }}>Thanks for rating ✓</span>
        ) : count > 0 ? (
          <>★ {avg?.toFixed(1)} · {count} rating{count === 1 ? '' : 's'}</>
        ) : (
          'Be the first to rate'
        )}
      </span>
    </div>
  );
}
