import { Suspense } from 'react';
import { config } from '@/lib/server/config';
import { C } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import LoginClient from './LoginClient';

// Read Google config at request time so the button appears automatically once
// GOOGLE_CLIENT_ID/SECRET are set — no build-time flag, no redeploy needed.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}><Spinner /></div>}>
      <LoginClient googleEnabled={config.googleEnabled} />
    </Suspense>
  );
}
