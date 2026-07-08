'use client';
import { useState } from 'react';
import { recipeApi } from '@/lib/api';
import { C } from '@/lib/tokens';

/**
 * Thumbs up / down on a recipe. The vote personalizes future AI generations
 * (see personalization service). `dark` variant for use on dark cards.
 */
export function Feedback({ recipeId, initial = 0, dark = false }: { recipeId: string; initial?: number; dark?: boolean }) {
  const [vote, setVote] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function cast(v: 1 | -1) {
    if (busy) return;
    const next = vote === v ? 0 : v; // toggle off if same
    setBusy(true);
    setVote(next);
    try {
      await recipeApi.feedback(recipeId, next as 1 | -1 | 0);
    } catch {
      setVote(vote); // roll back
    } finally {
      setBusy(false);
    }
  }

  const base = dark ? 'rgba(250,245,236,0.5)' : C.muted55;
  const btn = (active: boolean, color: string): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 17,
    lineHeight: 1,
    padding: 4,
    opacity: active ? 1 : 0.55,
    filter: active ? 'none' : 'grayscale(1)',
    color: active ? color : base,
    transition: 'opacity .15s',
  });

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Rate this recipe to personalize future creations">
      <button style={btn(vote === 1, C.green)} onClick={() => cast(1)} aria-label="Thumbs up">👍</button>
      <button style={btn(vote === -1, C.rust)} onClick={() => cast(-1)} aria-label="Thumbs down">👎</button>
    </div>
  );
}
