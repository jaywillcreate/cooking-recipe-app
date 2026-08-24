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

/**
 * The customer-facing domain, used when the platform can't tell us. Checked in
 * rather than left to configuration because a wrong canonical URL is silent and
 * costly: it points search engines at the deployment host instead of here.
 */
const PRODUCTION_DOMAIN = 'https://tastyember.com';

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Public origin of the deployed app (for email links). On Vercel, VERCEL_URL
  // is set automatically; APP_ORIGIN overrides it (use your custom domain).
  get appOrigin(): string {
    return process.env.APP_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  },

  /**
   * The domain the public sees — canonical URLs, share links, OG tags, the
   * sitemap. Deliberately separate from appOrigin: OAuth redirect URIs have to
   * match what's registered with Google, so appOrigin can't be repointed at a
   * custom domain without re-registering, while canonical and share URLs must
   * name the real domain or search engines index the deployment URL instead.
   *
   * Resolution order, each step a fallback for the one before:
   *   1. PUBLIC_ORIGIN — explicit, wins over everything.
   *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel sets this to the shortest
   *      production custom domain (so, the real domain). Blank only when
   *      "Enable access to System Environment Variables" is off.
   *   3. PRODUCTION_DOMAIN — a checked-in default so a deployment can never
   *      fall back to advertising its *.vercel.app URL as canonical.
   *   4. appOrigin — local development, where that is localhost.
   */
  get publicOrigin(): string {
    if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN;
    const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercelDomain) return `https://${vercelDomain}`;
    if (process.env.VERCEL) return PRODUCTION_DOMAIN;
    return this.appOrigin;
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
  // Recipes with detailed method steps (temps, doneness cues, tips) need more
  // room than the original 2500 — a truncated response = unparseable JSON.
  anthropicMaxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '4000', 10),

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

  // USDA FoodData Central — the source of truth for calculated recipe macros.
  // Free key from https://fdc.nal.usda.gov/api-key-signup/. Without one we fall
  // back to DEMO_KEY, which is throttled hard enough that calculation will
  // often fail; the UI then shows the model's estimate, clearly labelled.
  fdcApiKey: process.env.FDC_API_KEY ?? 'DEMO_KEY',
  get fdcConfigured(): boolean {
    return !!process.env.FDC_API_KEY;
  },

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
