import Link from 'next/link';
import { C } from '@/lib/tokens';
import { Wordmark } from '@/components/Wordmark';

/** A link that was never published, or has since been unshared. */
export default function ShareNotFound() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24, textAlign: 'center' }}>
      <Wordmark size={22} />
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>This recipe isn&apos;t shared</div>
      <p style={{ fontSize: 14.5, color: C.muted65, maxWidth: '44ch', lineHeight: 1.6, margin: 0 }}>
        The link may have expired, or the cook stopped sharing it. You can still have TastyEmber invent one for you.
      </p>
      <Link href="/create" style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 14, padding: '14px 26px', borderRadius: 999, textDecoration: 'none' }}>
        ✦ Create a recipe
      </Link>
    </div>
  );
}
