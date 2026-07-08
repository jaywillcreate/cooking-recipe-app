import { C } from '@/lib/tokens';

/**
 * The TastyEmber wordmark: "Tasty" in a playful script, "Ember." kept in the
 * original bold Archivo style with the rust dot. No hooks — safe in server
 * components too.
 */
export function Wordmark({ size = 21, color, dot = C.rust }: { size?: number; color?: string; dot?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', color, whiteSpace: 'nowrap' }}>
      <span
        style={{
          fontFamily: 'var(--font-script), cursive',
          fontWeight: 400,
          fontSize: size * 1.02,
          lineHeight: 1,
          color: color ?? C.rust,
          marginRight: size * 0.02,
          transform: 'rotate(-6deg)',
          transformOrigin: 'bottom right',
          paddingRight: 2,
        }}
      >
        Tasty
      </span>
      <span style={{ fontWeight: 900, fontSize: size, letterSpacing: -0.5, lineHeight: 1 }}>
        Ember<span style={{ color: dot }}>.</span>
      </span>
    </span>
  );
}
