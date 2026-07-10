'use client';
import { useEffect, useState } from 'react';
import { imagesApi } from './api';

interface Opts {
  stepIndex?: number;
  /**
   * When false, the request is held. Step images pass the hero's readiness here
   * so the anchor image is generated & cached first — then every step resolves
   * against that one hero, keeping the series visually consistent (and avoiding
   * duplicate anchor generations).
   */
  enabled?: boolean;
}

/**
 * Resolve the image for a recipe hero (omit `stepIndex`) or a method step.
 * Starts from the keyless Pollinations `fallbackUrl` (instant), then swaps in
 * the Gemini "Nano Banana" Blob URL once /api/images resolves it. `ready` flips
 * true when the endpoint has responded (success or not) — callers that prefer a
 * skeleton over the fallback can gate on it.
 */
export function useGeneratedImage(recipeId: string, fallbackUrl: string, opts: Opts = {}): { url: string; ready: boolean } {
  const { stepIndex, enabled = true } = opts;
  const [url, setUrl] = useState(fallbackUrl);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setUrl(fallbackUrl);
    if (!recipeId || !enabled) return;
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
  }, [recipeId, stepIndex, fallbackUrl, enabled]);

  return { url, ready };
}
