'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { C, navStyle } from '@/lib/tokens';

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, savedCount } = useApp();

  const isActive = (base: string) =>
    base === '/discover' ? pathname.startsWith('/discover') || pathname.startsWith('/recipe') : pathname.startsWith(base);

  const avatarUrl = profile?.avatarUrl;
  const initial = (profile?.name || 'You').trim().charAt(0).toUpperCase();

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(250,245,236,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 28px',
          gap: 16,
        }}
      >
        <div
          style={{ fontWeight: 900, fontSize: 21, letterSpacing: -0.5, cursor: 'pointer' }}
          onClick={() => router.push('/discover')}
        >
          EMBER<span style={{ color: C.rust }}>.</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={navStyle(isActive('/discover'))} onClick={() => router.push('/discover')}>
            Discover
          </button>
          <button style={navStyle(isActive('/create'))} onClick={() => router.push('/create')}>
            ✦ Create
          </button>
          <button style={navStyle(isActive('/daily'))} onClick={() => router.push('/daily')}>
            Daily
          </button>
          <button style={navStyle(isActive('/cookbook'))} onClick={() => router.push('/cookbook')}>
            Cookbook{' '}
            <span style={{ fontSize: 11, background: C.line, borderRadius: 999, padding: '1px 7px', marginLeft: 2 }}>
              {savedCount}
            </span>
          </button>
        </div>
        <div
          onClick={() => router.push('/profile')}
          title="Profile & preferences"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            flex: 'none',
            background: avatarUrl ? `${C.rust} url("${avatarUrl}") center/cover no-repeat` : C.rust,
          }}
        >
          {avatarUrl ? '' : initial}
        </div>
      </div>
    </div>
  );
}
