'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { ApiError } from '@/lib/api';
import { C } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { Wordmark } from '@/components/Wordmark';

export default function LoginClient({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, user, bootstrap, login, register } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (!ready) void bootstrap();
  }, [ready, bootstrap]);
  useEffect(() => {
    if (ready && user) router.replace('/discover');
  }, [ready, user, router]);
  useEffect(() => {
    const e = params.get('error');
    if (e) setError(e);
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(email, password, name);
        router.replace('/profile');
      } else {
        await login(email, password, remember);
        router.replace('/discover');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`,
    borderRadius: 12, padding: '14px 16px', fontFamily: 'inherit', fontSize: 15, background: C.bg, color: C.ink, marginBottom: 12,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Wordmark size={30} />
        </div>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13.5, marginTop: 0, marginBottom: 22 }}>
          {mode === 'login' ? 'Welcome back to your kitchen.' : 'Create your account — a new recipe awaits daily.'}
        </p>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '28px 30px' }}>
          {error && (
            <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}

          {googleEnabled && (
            <>
              <a
                href="/api/auth/google/start"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
                  border: `1.5px solid ${C.line22}`, borderRadius: 999, padding: '12px 16px', fontWeight: 700, fontSize: 14,
                  background: '#fff', color: C.ink, textDecoration: 'none', marginBottom: 16,
                }}
              >
                <GoogleG /> Continue with Google
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px' }}>
                <div style={{ flex: 1, height: 1, background: C.line }} />
                <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>or</span>
                <div style={{ flex: 1, height: 1, background: C.line }} />
              </div>
            </>
          )}

          <form onSubmit={submit}>
            {mode === 'register' && <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            <input style={input} type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <input style={{ ...input, marginBottom: mode === 'login' ? 14 : 20 }} type="password" placeholder={mode === 'register' ? 'Password (min 10 characters)' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required />
            {mode === 'login' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.muted75, marginBottom: 18, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.rust, cursor: 'pointer' }} />
                Remember this device
              </label>
            )}
            <button type="submit" disabled={busy} style={{ width: '100%', background: C.rust, color: '#fff', fontWeight: 800, fontSize: 15, padding: '14px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {busy && <Spinner size={16} color="#fff" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 18 }}>
          {mode === 'login' ? 'New to TastyEmber? ' : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} style={{ background: 'none', border: 'none', color: C.rust, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
