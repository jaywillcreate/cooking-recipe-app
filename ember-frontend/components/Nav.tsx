'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { C, navStyle } from '@/lib/tokens';
import { Wordmark } from './Wordmark';

const NAV_ITEMS: { label: string; href: string; badge?: boolean }[] = [
  { label: 'Discover', href: '/discover' },
  { label: '✦ Create', href: '/create' },
  { label: 'Daily', href: '/daily' },
  { label: 'Cookbook', href: '/cookbook', badge: true },
];

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, savedCount } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (base: string) =>
    base === '/discover' ? pathname.startsWith('/discover') || pathname.startsWith('/recipe') : pathname.startsWith(base);

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const avatarUrl = profile?.avatarUrl;
  const initial = (profile?.name || 'You').trim().charAt(0).toUpperCase();

  const avatar = (
    <div
      onClick={() => go('/profile')}
      title="Profile & preferences"
      style={{
        width: 36, height: 36, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', flex: 'none',
        background: avatarUrl ? `${C.rust} url("${avatarUrl}") center/cover no-repeat` : C.rust,
      }}
    >
      {avatarUrl ? '' : initial}
    </div>
  );

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250,245,236,0.95)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.line}` }}>
        <div className="nav-inner" style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', gap: 16 }}>
          <div style={{ cursor: 'pointer' }} onClick={() => go('/discover')}>
            <Wordmark size={21} />
          </div>

          {/* Desktop pills */}
          <div className="nav-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {NAV_ITEMS.map((it) => (
              <button key={it.href} style={navStyle(isActive(it.href))} onClick={() => go(it.href)}>
                {it.label}
                {it.badge && (
                  <span style={{ fontSize: 11, background: C.line, borderRadius: 999, padding: '1px 7px', marginLeft: 4 }}>{savedCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Right: hamburger (mobile only) + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="nav-hamburger"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: C.ink }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {avatar}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(36,26,18,0.45)', backdropFilter: 'blur(2px)', animation: 'emberFade 0.15s ease' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(320px, 84vw)', background: C.bg,
              boxShadow: '-8px 0 30px rgba(36,26,18,0.18)', display: 'flex', flexDirection: 'column', padding: '18px 20px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <Wordmark size={20} />
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, lineHeight: 1, color: C.muted, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {NAV_ITEMS.map((it) => {
                const active = isActive(it.href);
                return (
                  <button
                    key={it.href}
                    onClick={() => go(it.href)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                      fontFamily: 'inherit', fontSize: 17, fontWeight: 700, textAlign: 'left', cursor: 'pointer',
                      padding: '14px 16px', borderRadius: 12, border: 'none',
                      background: active ? C.gold : 'transparent', color: active ? C.ink : C.muted75,
                    }}
                  >
                    <span>{it.label}</span>
                    {it.badge && (
                      <span style={{ fontSize: 12, fontWeight: 800, background: active ? 'rgba(36,26,18,0.15)' : C.line, borderRadius: 999, padding: '2px 9px' }}>{savedCount}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 'auto', borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <button
                onClick={() => go('/profile')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px', fontFamily: 'inherit' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flex: 'none', background: avatarUrl ? `${C.rust} url("${avatarUrl}") center/cover no-repeat` : C.rust }}>
                  {avatarUrl ? '' : initial}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{profile?.name || 'Your profile'}</div>
                  <div style={{ fontSize: 12, color: C.muted55 }}>Profile & preferences</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
