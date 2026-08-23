-- ══════════════════════════════════════════════════════════════════════════
--  Ember — PostgreSQL schema (idempotent). Run with: npm run migrate
--  Works on Prisma Postgres (Vercel): citext + pgcrypto are supported.
-- ══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT,                 -- NULL for OAuth-only (Google) accounts
  google_id TEXT,                     -- Google "sub" when linked
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent upgrades for databases created before Google login was added:
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email_daily BOOLEAN NOT NULL DEFAULT FALSE,
  cuisines TEXT[] NOT NULL DEFAULT '{}',
  diets TEXT[] NOT NULL DEFAULT '{}',
  allergies TEXT NOT NULL DEFAULT '',
  skill TEXT NOT NULL DEFAULT 'Comfortable',
  time_budget TEXT NOT NULL DEFAULT '30 min',
  goal TEXT NOT NULL DEFAULT 'Balanced',
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT,
  daily_on_hand TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  kid_friendly BOOLEAN NOT NULL DEFAULT FALSE,
  daily_hour INTEGER NOT NULL DEFAULT 8,     -- local hour (0-23) to deliver the daily recipe
  allergens TEXT[] NOT NULL DEFAULT '{}',     -- selected common allergens
  bake_type TEXT NOT NULL DEFAULT '',         -- daily "Baking studio": preferred bake type
  bake_flavor TEXT NOT NULL DEFAULT '',       -- daily "Baking studio": preferred flavour direction
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kid_friendly BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_hour INTEGER NOT NULL DEFAULT 8;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bake_type TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bake_flavor TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed','ai','web','daily')),
  title TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  mins INTEGER NOT NULL DEFAULT 30,
  time_label TEXT NOT NULL DEFAULT '30 min',
  difficulty TEXT NOT NULL DEFAULT 'Comfortable' CHECK (difficulty IN ('Beginner','Comfortable','Adventurous')),
  rating NUMERIC(2,1),
  reviews INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  steps TEXT[] NOT NULL DEFAULT '{}',
  nutrition JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipes_origin ON recipes(origin);
CREATE INDEX IF NOT EXISTS idx_recipes_source ON recipes(source);
-- (Full-text search runs on the query's to_tsvector/ILIKE expression directly;
--  no functional GIN index — Prisma Postgres rejects it as non-IMMUTABLE, and
--  it isn't needed at this scale.)

-- Thumbs up/down on recipes → personalizes future AI generations.
CREATE TABLE IF NOT EXISTS recipe_feedback (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON recipe_feedback(user_id);

CREATE TABLE IF NOT EXISTS saves (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (user_id, recipe_id, tag)
);

-- Per-user photo attached to any recipe (incl. shared seed catalog).
CREATE TABLE IF NOT EXISTS recipe_photos (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS followed_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  last_fetched TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE TABLE IF NOT EXISTS daily_recipes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, for_date)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create','daily','web','variant')),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage(user_id, created_at);

-- Fixed-window rate limiter buckets (serverless-safe).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'production' CHECK (channel IN ('production','staging','beta')),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version, channel)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

-- Durable cache of AI-generated recipe & step imagery (Gemini "Nano Banana").
-- Gemini returns image bytes, which we store in Vercel Blob; this maps a
-- deterministic cache key → the CDN URL so each image is generated only once.
-- Also created lazily by lib/server/services/images.ts for zero-migration deploys.
CREATE TABLE IF NOT EXISTS generated_images (
  cache_key  TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  provider   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-step-image revision + accumulated correction from user feedback, so
-- feedback-driven regenerations improve on prior attempts. Created lazily too.
CREATE TABLE IF NOT EXISTS image_revisions (
  base_key   TEXT PRIMARY KEY,
  rev        INT NOT NULL DEFAULT 0,
  correction TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw 👍/👎 feedback on visual-guide step images (with issue tags / notes).
CREATE TABLE IF NOT EXISTS image_feedback (
  id         BIGSERIAL PRIMARY KEY,
  base_key   TEXT NOT NULL,
  recipe_id  UUID,
  step_index INT,
  user_id    UUID,
  vote       SMALLINT NOT NULL,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_image_feedback_base ON image_feedback(base_key);

-- 5-star recipe ratings (one per user per recipe; created lazily too).
CREATE TABLE IF NOT EXISTS recipe_stars (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

-- Distilled culinary-best-practice guidance, refreshed weekly by the research
-- agent (/api/cron/culinary) and folded into recipe-generation prompts.
CREATE TABLE IF NOT EXISTS culinary_guidance (
  id         BIGSERIAL PRIMARY KEY,
  content    TEXT NOT NULL,
  sources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_touch ON profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Existing databases predate the 'variant' ai_usage kind (secondary calls of a
-- multi-variation create); refresh the check constraint idempotently.
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_kind_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_kind_check CHECK (kind IN ('create','daily','web','variant'));

-- ─── Profile dashboard: nutrition tracker, meal plan, Google Calendar ───────
-- Also created lazily by ensureDashboardTables() in lib/server/db.ts so a
-- Vercel push works before `npm run migrate` is run.

-- Daily macro targets shown against the nutrition tracker's logged totals.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_calories INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_protein INTEGER NOT NULL DEFAULT 100;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_carbs INTEGER NOT NULL DEFAULT 250;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_fat INTEGER NOT NULL DEFAULT 70;

-- Nutrition tracker: what the user actually ate, one row per logged item.
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,
  meal TEXT NOT NULL DEFAULT 'dinner' CHECK (meal IN ('breakfast','lunch','dinner','snack')),
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cal INTEGER NOT NULL DEFAULT 0,
  protein INTEGER NOT NULL DEFAULT 0,
  carbs INTEGER NOT NULL DEFAULT 0,
  fat INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nutrition_user_date ON nutrition_logs(user_id, for_date);

-- Meal plan calendar: one entry per user/date/slot, free-text or a recipe.
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner','snack')),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  gcal_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date, slot)
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date ON meal_plans(user_id, plan_date);

-- Google Calendar connection — separate from Google *login*: that flow is
-- access_type=online and never stores tokens. This one keeps the offline
-- refresh token so we can insert meal-plan events later.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public recipe sharing: a recipe is reachable at /r/<share_slug> only once
-- is_public is true. Seed recipes (owner_id IS NULL) are the public catalogue;
-- a user's own creations stay private until they explicitly share them.
-- Mirrored at runtime by ensureSharingColumns() in lib/server/services/sharing.ts.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS share_slug TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_share_slug ON recipes(share_slug) WHERE share_slug IS NOT NULL;
UPDATE recipes SET is_public = TRUE, shared_at = COALESCE(shared_at, created_at)
 WHERE owner_id IS NULL AND is_public = FALSE;
