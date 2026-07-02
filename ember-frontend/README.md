# Ember — AI Recipe Web App (full-stack Next.js, deploys to Vercel)

One Next.js 14 app containing **everything**: the user-facing UI, the entire API
(as Route Handlers), the admin dashboard, the daily-recipe automation (Vercel
Cron), and photo storage (Vercel Blob). Push it to GitHub, import to Vercel,
done. No separate backend to host.

- **User app** (`/discover`, `/create`, `/daily`, `/cookbook`, `/recipe/[id]`, `/profile`, `/login`)
- **API** under `/api/*` — auth, profiles, recipes, cookbook, sites, AI generation, daily, photos
- **Admin dashboard** at `/admin` — usage overview, user/profile management, release log
- **Daily automation** — `/api/cron/daily` triggered by Vercel Cron
- **Postgres** via Prisma Postgres (or any Postgres), accessed with `pg` + raw SQL

> This folder (`ember-frontend/`) is the complete application. The separate
> `ember-backend/` folder from earlier is **superseded** and no longer needed —
> you can delete it.

---

## Deploy to Vercel (from GitHub) — step by step

### 1. Push to GitHub
```bash
cd ember-frontend
git init && git add . && git commit -m "Ember"
gh repo create ember --private --source=. --push   # or create the repo in the UI and push
```

### 2. Provision storage on Vercel
In the Vercel dashboard → **Storage**:
- **Prisma Postgres** — create it (you've done this). Open it and copy the
  **direct** connection string (`postgres://…@db.prisma.io:5432/?sslmode=require`),
  not the `prisma+postgres://…accelerate…` one.
- **Blob** — create a Blob store and connect it to the project (this auto-adds
  `BLOB_READ_WRITE_TOKEN`). Used for dish/avatar photos.

### 3. Import the repo as a Vercel Project
New Project → import the GitHub repo. **Set Root Directory to `ember-frontend`**
(unless you moved these files to the repo root). Framework preset: Next.js.

### 4. Add Environment Variables (Project → Settings → Environment Variables)
From `.env.local.example`. Minimum:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Prisma Postgres **direct** string |
| `PGSSLMODE` | `require` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `ADMIN_SESSION_SECRET` | each `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | your Claude API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` |
| `CRON_SECRET` | `openssl rand -hex 32` (Vercel Cron sends it automatically) |
| `EMAIL_PROVIDER` | `console` to start; `resend` + `RESEND_API_KEY` for real email |
| `APP_ORIGIN` | your production URL (e.g. `https://ember.vercel.app`) |

`BLOB_READ_WRITE_TOKEN` is added automatically when you connect the Blob store.

### 5. Create the database tables + seed (run once, locally)
Point your local machine at the same DB and run the scripts:
```bash
cp .env.local.example .env.local     # paste DATABASE_URL (direct) + PGSSLMODE=require
npm install
npm run migrate        # creates all tables (idempotent; citext/pgcrypto supported on Prisma Postgres)
npm run seed           # inserts the 10-recipe catalog
npm run create-admin -- you@ember.app 'a-long-strong-password'
```

### 6. Deploy
Vercel deploys on push. The **daily cron** (`vercel.json`) is registered
automatically and runs `/api/cron/daily` once a day, generating + emailing each
opted-in user's recipe. It's protected by `CRON_SECRET`.

That's it — visit your URL, create an account, and the app is live. Admin is at
`/your-domain/admin`.

---

## Run locally

```bash
cp .env.local.example .env.local   # fill in DATABASE_URL, secrets, ANTHROPIC_API_KEY
npm install
npm run migrate && npm run seed && npm run create-admin -- you@x.com 'a-long-password'
npm run dev                        # http://localhost:3000
```

To exercise the daily cron locally:
```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## Architecture notes

| Concern | Implementation |
|---|---|
| API | Next.js Route Handlers in `app/api/**` (Node.js runtime). Shared `route()` wrapper does auth + uniform error handling. |
| Auth | Access token in memory on the client; rotating refresh token in a first-party httpOnly cookie. Same-origin ⇒ no CORS. Passwords hashed with `@node-rs/argon2` (prebuilt binaries that run on Vercel's Lambda). |
| DB | `pg` with a globally-cached pool (serverless-safe). Use the Prisma Postgres **pooled** string in production if you hit connection limits; **direct** for migrations. |
| Rate limiting | Postgres-backed fixed-window limiter (`rate_limits` table) — works across ephemeral serverless instances. Per-user daily generation cap via the `ai_usage` log. |
| Photos | `@vercel/blob` (durable, CDN-served); validated (MIME + size + magic-bytes). |
| Daily job | `vercel.json` cron → `/api/cron/daily` (guarded by `CRON_SECRET`) → generates + emails all due users. |
| Admin | Server Components (read) + Server Actions (mutations, with built-in CSRF protection); own httpOnly session cookie. |

### Plan limits to know
- **Vercel Cron on Hobby** runs a job at most **once per day** and functions cap
  at **60s**. The daily sweep serves every opted-in user in one run at 13:00 UTC.
  For a large user base, upgrade to Pro (longer duration / more frequent crons)
  or batch the sweep.
- **Email**: `console` mode just logs. For real delivery set `EMAIL_PROVIDER=resend`,
  add `RESEND_API_KEY`, and verify your sending domain (SPF/DKIM/DMARC).

## Project structure
```
app/
  (app)/              User screens (auth-gated) + nav
  admin/              Admin dashboard (login, overview, users, releases) + Server Actions
  api/                All API Route Handlers
  login/              Sign in / register
components/           Nav, RecipeCard, Chip, Spinner, ImageUpload
lib/
  api.ts store.ts tokens.ts types.ts     Client
  server/             config, db, http, auth, services (ai/email/daily/webSources/usage/recipes/rateLimit), adminSession
db/schema.sql         Idempotent schema
scripts/              migrate · seed · create-admin (run with tsx)
vercel.json           Cron schedule
```
