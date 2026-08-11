'use client';
import { useMemo, useState } from 'react';
import { C, CUISINES, chipStyle } from '@/lib/tokens';

/**
 * Multi-select cuisine picker following filter-chip best practice: chips wrap
 * into rows (no horizontal scroll — hidden options don't get discovered),
 * long lists collapse behind an explicit "+N more" expander, the user's
 * favourite cuisines sort first, selected chips are always visible and
 * checkmarked, and one tap clears everything.
 */
export function CuisineChips({
  options = CUISINES,
  selected,
  onToggle,
  onClear,
  allLabel,
  activeColor = C.green,
  favorites = [],
  collapsedCount = 10,
  small = true,
}: {
  options?: string[];
  selected: string[];
  onToggle: (c: string) => void;
  /** Deselect everything (used by the leading "All"-style chip and Clear). */
  onClear?: () => void;
  /** Leading chip shown active while nothing is selected (e.g. "All", "✦ Surprise me"). */
  allLabel?: string;
  activeColor?: string;
  /** Cuisines to sort first (typically the user's profile favourites). */
  favorites?: string[];
  collapsedCount?: number;
  small?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Stable, personalized order: profile favourites first, then the rest in
  // canonical order. Recomputing on selection would make chips jump underfoot.
  const ordered = useMemo(() => {
    const favs = options.filter((c) => favorites.includes(c));
    return [...favs, ...options.filter((c) => !favs.includes(c))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, favorites.join('|')]);

  // Collapsed view keeps every selected chip visible so the applied filters
  // always read at a glance.
  const visible = expanded
    ? ordered
    : [...ordered.slice(0, collapsedCount), ...ordered.slice(collapsedCount).filter((c) => selected.includes(c))];
  const hiddenCount = ordered.length - visible.length;

  const ghostChip: React.CSSProperties = {
    ...chipStyle(false, activeColor, small),
    color: C.muted55,
    borderStyle: 'dashed',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 6 : 8, alignItems: 'center' }}>
      {allLabel && onClear && (
        <button style={chipStyle(selected.length === 0, activeColor, small)} onClick={onClear}>
          {allLabel}
        </button>
      )}
      {visible.map((c) => {
        const active = selected.includes(c);
        return (
          <button key={c} style={chipStyle(active, activeColor, small)} onClick={() => onToggle(c)} aria-pressed={active}>
            {active ? '✓ ' : ''}{c === 'Baking' ? '🧁 Baking' : c}
          </button>
        );
      })}
      {!expanded && hiddenCount > 0 && (
        <button style={ghostChip} onClick={() => setExpanded(true)}>
          +{hiddenCount} more ▾
        </button>
      )}
      {expanded && (
        <button style={ghostChip} onClick={() => setExpanded(false)}>
          Show less ▴
        </button>
      )}
      {!allLabel && onClear && selected.length > 0 && (
        <button style={{ ...ghostChip, borderColor: 'transparent' }} onClick={onClear}>
          × Clear ({selected.length})
        </button>
      )}
    </div>
  );
}
