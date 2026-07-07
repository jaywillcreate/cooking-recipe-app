import { route, requireUser, json, forbidden } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { emailConfigured } from '@/lib/server/services/email';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Admin-only config diagnostics (booleans only — never leaks secret values). */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden('Admin only');
  return json({
    email: {
      provider: config.emailProvider,
      configured: emailConfigured(),
      hasBrevoKey: !!config.brevoApiKey,
      hasResendKey: !!config.resendApiKey,
      from: config.emailFrom,
    },
    appOrigin: config.appOrigin,
    cronSecretSet: !!config.cronSecret,
    googleEnabled: config.googleEnabled,
  });
});
