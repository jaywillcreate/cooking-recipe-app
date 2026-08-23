'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { Spinner } from '@/components/Spinner';
import { C } from '@/lib/tokens';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, user, bootstrap } = useApp();

  useEffect(() => {
    if (!ready) void bootstrap();
  }, [ready, bootstrap]);

  useEffect(() => {
    if (ready && !user) {
      // Keep where they were going so a shared-recipe visitor lands on Create
      // (craving and all) instead of a generic feed after signing in. Read from
      // the browser rather than useSearchParams — this only ever runs client
      // side, and the hook would opt every app page out of static prerender.
      const dest = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(dest)}`);
    }
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.ink }}>
      <Nav />
      <div className="ember-screen" style={{ flex: 1 }}>{children}</div>
      <Footer />
    </div>
  );
}
