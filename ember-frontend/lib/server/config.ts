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

  // Gemini 2.5 Flash Image ("Nano Banana") for higher-quality recipe & step
  // imagery. Optional — when GEMINI_API_KEY is unset, imagery falls back to the
  // keyless Pollinations generator. GOOGLE_AI_API_KEY is accepted as an alias.
  get geminiApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  },
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image',
  get geminiEnabled(): boolean {
    return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  },
  // Per-user daily cap on Gemini image generations — a safety valve on spend
  // (each image ≈ $0.039). Cached images don't count against this.
  geminiImageDailyLimit: parseInt(process.env.GEMINI_IMAGE_DAILY_LIMIT ?? '150', 10),

  // Pollinations image fallback (used server-side, cached to Blob). Optional
  // token/referrer lift the anonymous per-IP rate limit — register at
  // https://enter.pollinations.ai. Referrer defaults to the app name.
  pollinationsToken: process.env.POLLINATIONS_TOKEN,
  pollinationsReferrer: process.env.POLLINATIONS_REFERRER ?? 'tastyember.app',

  emailProvider: (process.env.EMAIL_PROVIDER ?? 'console') as 'resend' | 'brevo' | 'console',
  emailFrom: process.env.EMAIL_FROM ?? 'TastyEmber <hello@ember.app>',
  resendApiKey: process.env.RESEND_API_KEY,
  brevoApiKey: process.env.BREVO_API_KEY,

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
