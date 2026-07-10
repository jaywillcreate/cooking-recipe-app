'use client';
import { useState } from 'react';
import { C, stepImageUrl } from '@/lib/tokens';
import { useGeneratedImage } from '@/lib/useGeneratedImage';

/**
 * A generated instructional image for one method step. Resolves via /api/images
 * (Gemini "Nano Banana" when configured, else keyless Pollinations), shows a
 * shimmer skeleton while generating, and hides itself if the image fails so a
 * broken image never appears.
 */
export function StepImage({ recipeId, cuisine, index, text, title, anchorReady = true }: { recipeId: string; cuisine: string; index: number; text: string; title?: string; anchorReady?: boolean }) {
  const fallback = stepImageUrl(recipeId, cuisine, index, text, title);
  const { url, ready } = useGeneratedImage(recipeId, fallback, { stepIndex: index, enabled: anchorReady });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const showSkeleton = !ready || !loaded;

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
        background: showSkeleton ? `linear-gradient(100deg, ${C.bg} 30%, rgba(196,85,45,0.08) 50%, ${C.bg} 70%)` : 'transparent',
        backgroundSize: '200% 100%',
        animation: showSkeleton ? 'emberShimmer 1.4s ease-in-out infinite' : 'none',
      }}
    >
      {showSkeleton && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.muted55 }}>
          ✦ generating step {index + 1}…
        </div>
      )}
      {/* Only mount the <img> once the endpoint has resolved the final URL, to
          avoid loading the Pollinations fallback then swapping to Gemini. */}
      {ready && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Step ${index + 1} illustration`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity .35s ease' }}
        />
      )}
    </div>
  );
}
