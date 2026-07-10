'use client';
import { useEffect, useState } from 'react';
import { imagesApi } from './api';

/**
 * Resolve the image for a recipe hero (omit `stepIndex`) or a method step.
 * Starts from the keyless Pollinations `fallbackUrl` (instant), then swaps in
 * the Gemini "Nano Banana" Blob URL once /api/images resolves it. `ready` flips
 * true when the endpoint has responded (success or not) — callers that prefer a
 * skeleton over the fallback can gate on it.
 */
export function useGeneratedImage(
  recipeId: string,
  fallbackUrl: string,
  stepIndex?: number,
): { url: string; ready: boolean } {
  const [url, setUrl] = useState(fallbackUrl);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setUrl(fallbackUrl);
    if (!recipeId) return;
    imagesApi
      .generate(recipeId, stepIndex)
      .then((r) => {
        if (alive && r?.url) setUrl(r.url);
      })
      .catch(() => {
        /* keep the fallback */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [recipeId, stepIndex, fallbackUrl]);

  return { url, ready };
}
