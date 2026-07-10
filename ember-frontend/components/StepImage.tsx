'use client';
import { useState } from 'react';
import { C, stepImageUrl } from '@/lib/tokens';

/**
 * A generated instructional image for one method step. Lazy-loads, shows a
 * shimmer skeleton while generating, and hides itself if generation fails so a
 * broken image never appears.
 */
export function StepImage({ recipeId, cuisine, index, text }: { recipeId: string; cuisine: string; index: number; text: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const url = stepImageUrl(recipeId, cuisine, index, text);

  return (
    <div
      style={{
        position: 'relative',
        marginTop: 12,
        width: '100%',
        maxWidth: 420,
        aspectRatio: '512 / 340',
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${C.line}`,
        background: loaded ? 'transparent' : `linear-gradient(100deg, ${C.bg} 30%, rgba(196,85,45,0.08) 50%, ${C.bg} 70%)`,
        backgroundSize: '200% 100%',
        animation: loaded ? 'none' : 'emberShimmer 1.4s ease-in-out infinite',
      }}
    >
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.muted55 }}>
          ✦ generating step {index + 1}…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Step ${index + 1} illustration`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity .35s ease' }}
      />
    </div>
  );
}
