import type { KitchenIconName } from '@/lib/equipment';

/**
 * Line-art kitchen tool icons (24×24, ~1.7 stroke, rounded) — vector visuals
 * replacing the emoji in the "Cooking items needed" section.
 */
const PATHS: Record<KitchenIconName, React.ReactNode> = {
  board: (
    <>
      <rect x="4" y="4" width="16" height="15" rx="2.5" />
      <circle cx="12" cy="7.5" r="1" />
    </>
  ),
  knife: (
    <>
      <path d="M4 15 15 4c2 1.5 2.5 4 1 6L8 18" />
      <path d="M8 18 4 21" />
    </>
  ),
  peeler: (
    <>
      <path d="M9 3v7a3 3 0 0 0 6 0V3" />
      <path d="M12 13v8" />
      <path d="M8 3h8" />
    </>
  ),
  grater: (
    <>
      <path d="M8 3h5l4 16H6z" />
      <path d="M10 8h.01M13 8h.01M9.5 12h.01M12.5 12h.01" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 10h18a9 8 0 0 1-18 0Z" />
      <path d="M3 10c1-2 5-3 9-3s8 1 9 3" />
    </>
  ),
  whisk: (
    <>
      <path d="M12 3v10" />
      <path d="M12 13c-3 0-5 2-6 5M12 13c3 0 5 2 6 5M12 13c-1.5 0-2.5 2-3 5M12 13c1.5 0 2.5 2 3 5" />
      <path d="M11 20h2" />
    </>
  ),
  measuring: (
    <>
      <path d="M4 8h13v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" />
      <path d="M17 10h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 8V5M11.5 8V5M15 8V5" />
    </>
  ),
  skillet: (
    <>
      <circle cx="10" cy="13" r="6" />
      <path d="M16 13h6" />
    </>
  ),
  saucepan: (
    <>
      <path d="M3 9h14v4a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <path d="M17 10h5" />
    </>
  ),
  pot: (
    <>
      <path d="M5 9h14v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M5 11H2M19 11h3" />
      <path d="M8 9V7h8v2" />
    </>
  ),
  wok: (
    <>
      <path d="M3 10h18a9 7 0 0 1-18 0Z" />
      <path d="M3 10 1 8M21 10l2-2" />
    </>
  ),
  sheet: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M6 8V6.5M18 8V6.5" />
    </>
  ),
  dish: (
    <>
      <path d="M3 9h18l-2 9H5Z" />
      <path d="M3 9l2-3h14l2 3" />
    </>
  ),
  oven: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M7 6h.01M11 6h.01" />
      <rect x="6" y="12" width="12" height="6" rx="1.5" />
    </>
  ),
  blender: (
    <>
      <path d="M7 3h9l-1.5 10h-6Z" />
      <path d="M9 17h6v3a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z" />
      <path d="M9.5 13v4h5v-4" />
    </>
  ),
  processor: (
    <>
      <path d="M5 8h14v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M5 8V6h14v2" />
      <path d="M15 6V3h3v3" />
    </>
  ),
  mixer: (
    <>
      <path d="M4 21h9" />
      <path d="M6 21c0-5 2-8 6-8" />
      <rect x="11" y="4" width="9" height="5" rx="1.5" />
      <path d="M14 9v3M17 9v3" />
    </>
  ),
  colander: (
    <>
      <path d="M3 10h18a9 7 0 0 1-18 0Z" />
      <path d="M3 10c1-2 5-3 9-3s8 1 9 3" />
      <path d="M9 14h.01M12 15h.01M15 14h.01" />
      <path d="M9 20v-2M15 20v-2" />
    </>
  ),
  tongs: (
    <>
      <path d="M5 3c2 4 5 7 9 8M5 8c1.5 3 4 5 8 6" />
      <path d="M14 11l6 3M13 17l7 1" />
    </>
  ),
  rollingpin: (
    <>
      <rect x="5" y="9" width="14" height="6" rx="3" />
      <path d="M5 12H2M19 12h3" />
    </>
  ),
  grill: (
    <>
      <rect x="3" y="6" width="18" height="11" rx="2" />
      <path d="M3 10h18M3 13h18" />
      <path d="M8 6V4M16 6V4" />
    </>
  ),
};

export function KitchenIcon({ name, size = 22, color = 'currentColor' }: { name: KitchenIconName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      {PATHS[name]}
    </svg>
  );
}
