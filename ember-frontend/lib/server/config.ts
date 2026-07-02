import 'server-only';

/**
 * Server-side configuration, read from environment. In serverless (Vercel) env
 * vars are injected at runtime, so we read lazily and validate on first use.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Public origin of the deployed app (for email links). On Vercel, VERCEL_URL
  // is set automatically; APP_ORIGIN overrides it (use your custom domain).
  get appOrigin(): string {
    return process.env.APP_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  },

  get databaseUrl(): string {
    return req('DATABASE_URL');
  },
  pgSsl: (process.env.PGSSLMODE ?? 'require') === 'require',

  get jwtAccessSecret(): string {
    return req('JWT_ACCESS_SECRET');
  },
  get jwtRefreshSecret(): string {
    return req('JWT_REFRESH_SECRET');
  },
  get adminSessionSecret(): string {
    return req('ADMIN_SESSION_SECRET');
  },
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10),

  get anthropicApiKey(): string {
    return req('ANTHROPIC_API_KEY');
  },
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  anthropicMaxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '2500', 10),

  genDailyLimit: parseInt(process.env.GEN_DAILY_LIMIT ?? '25', 10),

  emailProvider: (process.env.EMAIL_PROVIDER ?? 'console') as 'resend' | 'console',
  emailFrom: process.env.EMAIL_FROM ?? 'Ember <hello@ember.app>',
  resendApiKey: process.env.RESEND_API_KEY,

  cronSecret: process.env.CRON_SECRET,

  // Google OAuth ("Sign in with Google"). Optional — the button/routes are
  // active only when both are set.
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  get googleEnabled(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  get googleRedirectUri(): string {
    return `${this.appOrigin}/api/auth/google/callback`;
  },

  siteAllowlist: (process.env.SITE_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};
