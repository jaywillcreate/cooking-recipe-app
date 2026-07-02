'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { ApiError } from '@/lib/api';
import { C } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';

export default function LoginPage() {
  const router = useRouter();
  const { ready, user, bootstrap, login, register } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) void bootstrap();
  }, [ready, bootstrap]);
  useEffect(() => {
    if (ready && user) router.replace('/discover');
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(email, password, name);
        router.replace('/profile'); // straight into onboarding
      } else {
        await login(email, password);
        router.replace('/discover');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid rgba(36,26,18,0.18)`,
    borderRadius: 12,
    padding: '14px 16px',
    fontFamily: 'inherit',
    fontSize: 15,
    background: C.bg,
    color: C.ink,
    marginBottom: 12,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
          EMBER<span style={{ color: C.rust }}>.</span>
        </div>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13.5, marginTop: 0, marginBottom: 22 }}>
          {mode === 'login' ? 'Welcome back to your kitchen.' : 'Create your account — a new recipe awaits daily.'}
        </p>
        <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '28px 30px' }}>
          {error && (
            <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          {mode === 'register' && (
            <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <input style={input} type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <input
            style={{ ...input, marginBottom: 20 }}
            type="password"
            placeholder={mode === 'register' ? 'Password (min 10 characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              background: C.rust,
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              padding: '14px',
              borderRadius: 999,
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {busy && <Spinner size={16} color="#fff" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 18 }}>
          {mode === 'login' ? "New to Ember? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            style={{ background: 'none', border: 'none', color: C.rust, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
