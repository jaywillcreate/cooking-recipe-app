'use client';
import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { C, mono } from '@/lib/tokens';

const LINKS = [
  { href: '/discover', label: 'Discover' },
  { href: '/create', label: 'Create' },
  { href: '/daily', label: 'Daily' },
  { href: '/cookbook', label: 'Cookbook' },
  { href: '/profile', label: 'Profile' },
];

/** Simple site-wide footer for the signed-in app shell. */
export function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${C.line}`, background: C.surface, marginTop: 40 }}>
      <div className="ember-wrap" style={{ paddingTop: 30, paddingBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <Wordmark size={19} />
            <div style={{ fontSize: 12.5, color: C.muted55, lineHeight: 1.6, marginTop: 9, maxWidth: '34ch' }}>
              Your AI sous-chef — personalized recipes, daily inspiration, and a cookbook that learns your taste.
            </div>
          </div>
          <nav aria-label="Footer" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 4 }}>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="footer-link" style={{ fontSize: 13, fontWeight: 700, color: C.muted75 }}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.muted55 }}>© {new Date().getFullYear()} TastyEmber</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.muted55 }}>cooked up with 🔥 and a pinch of AI</span>
        </div>
      </div>
    </footer>
  );
}
