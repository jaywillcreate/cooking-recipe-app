'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Nav } from '@/components/Nav';
import { Spinner } from '@/components/Spinner';
import { C } from '@/lib/tokens';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, user, bootstrap } = useApp();

  useEffect(() => {
    if (!ready) void bootstrap();
  }, [ready, bootstrap]);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>
      <Nav />
      <div className="ember-screen">{children}</div>
    </div>
  );
}
