'use client';
import { useState } from 'react';
import type { Recipe } from '@/lib/types';
import { recipeImageUrl, gradientFor, foodEmoji } from '@/lib/tokens';

/**
 * Recipe image with graceful fallback: shows the user's photo or a keyword
 * food photo; if the image fails to load, falls back to a cuisine-tinted
 * gradient with a food emoji so a card is never blank.
 */
export function RecipeThumb({
  recipe,
  height,
  radius = 0,
  emojiSize = 34,
}: {
  recipe: Recipe;
  height: number | string;
  radius?: number | string;
  emojiSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = recipeImageUrl(recipe);
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        overflow: 'hidden',
        position: 'relative',
        background: gradientFor(recipe.cuisine),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {failed ? (
        <span style={{ fontSize: emojiSize }}>{foodEmoji(recipe)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={recipe.title}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
}
