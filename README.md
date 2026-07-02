# Handoff: Ember — AI Recipe Creator Web App

## Overview
Ember is a personalized recipe web application. Users discover recipes, generate brand-new AI-created recipes from natural-language cravings and constraints, maintain a taste profile, save recipes into an organized cookbook (collections + tags + photos), follow favorite recipe sites, and receive one autonomously-generated recipe per day (in-app and by email).

This handoff covers the **complete front-end design** plus a **backend specification** so Claude Code can build the production system.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working interactive prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in a real application stack** (recommendation: React/Next.js front end + a Node or Python API + Postgres, or whatever the target codebase already uses) using its established patterns and libraries. If no environment exists yet, choose the most appropriate modern framework and implement the designs there.

- `Ember Prototype.dc.html` — the full prototype (all 6 screens, all interactions, working AI generation via an in-page Claude helper). Open in a browser to inspect. The `<x-dc>` template section contains all markup/styles inline; the `<script data-dc-script>` class contains all state logic, seed data, and AI prompt construction.
- `image-slot.js` — drag-and-drop image upload web component used for recipe photos and the profile avatar (prototype-only persistence; replace with real file upload + object storage).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final. Recreate pixel-perfectly. Recipe/dish photography is placeholder (striped blocks) — production should show real images (user uploads, scraped og:image, or AI-generated).

## Design Tokens
- Font: `Archivo` (Google Fonts; weights 400–900). Monospace accents (source labels, image placeholders): `IBM Plex Mono` 400/500.
- Background: `#faf5ec` (warm off-white). Cards/surfaces: `#ffffff`. Dark surface (daily card, buttons): `#241a12`.
- Ink (text): `#241a12`; muted text: `rgba(36,26,18,0.55–0.75)`; hairlines: `rgba(36,26,18,0.10–0.22)`.
- Accents: rust `#c4552d` (primary actions, brand dot), gold `#e8a13c` (active nav pill, daily badge), green `#2f7a4d` (AI/create, collections, web-source), gold-text `#9a6a10`.
- Cuisine accent map (card top-border + cuisine label): Italian `#c4552d`, Japanese/Baking `#9a6a10`, Thai/Mediterranean `#2f7a4d`, Mexican `#b0451f`, Indian `#a8621a`, Korean/American `#8c3b2e`, French `#7a5a2f`.
- Radii: cards 14–18px, inputs 10–14px, chips/buttons fully rounded (999px). Card top accent: 4px solid cuisine color.
- Type scale: hero title 36px/800/-1px; screen titles 26–34px/800; card titles 16.5px/700; section labels 11–12px/800/uppercase/1–2.5px tracking; body 13.5–14.5px; chips 12–12.5px/600–700.
- Hover on recipe cards: `translateY(-2px)` + `0 6px 18px rgba(36,26,18,0.1)` shadow.

## Screens / Views

### 1. Global navigation (sticky top bar)
Max-width 1200px centered, 14px vertical padding. Left: wordmark `EMBER.` (900 weight, rust dot) → Discover. Center: pill nav — Discover, ✦ Create, Daily, Cookbook (with saved-count badge). Active pill: gold `#e8a13c` bg, ink text; inactive: transparent, muted. Right: 36px circular avatar — user photo if uploaded, else first initial on rust; click → Profile wizard.

### 2. Discover (home)
- **Hero** (rust `#c4552d`, 18px radius, 2-col grid ~1.1fr/1fr): eyebrow "YOUR DAILY CREATION · {date}" in `#ffd9a3`; recipe title; 1-line personalized description; buttons "Cook tonight →" (dark pill) and "♡ Save to cookbook" (outline pill). Right half = dish photo. Shows today's generated daily recipe if present, else featured recipe.
- **Search bar**: white, 14px radius, magnifier in rust, placeholder "Search recipes, cuisines, ingredients — or describe a craving…", trailing green "✦ AI create" button that carries the query into the Create screen. Search filters across title/cuisine/tags/ingredients live.
- **Cuisine chips**: All + 7 cuisines; active = dark ink pill, inactive = outlined.
- **Results grid**: `repeat(auto-fill,minmax(255px,1fr))`, gap 18px. Card: photo (130px), cuisine label (accent color, uppercase), source badge ("web" / "✦ yours"), title, meta "time · difficulty · ★ rating".
- **Fresh from the web** (dashed-border panel): "My sites" chip list (removable ×, mono green chips) + input + "+ Add site" button. Below, mini-cards (52px thumb, title, source domain in green mono) for latest recipes from followed sites. Adding a site triggers a fetch/generation spinner ("fetching the latest from {domain}…"). In the prototype this is simulated with AI; **in production this is a real integration** (see backend spec).

### 3. Recipe detail
Back link, 18px-radius card. Header photo area (260px) is an **upload drop-zone** (drag/click, reframeable crop) with 4px cuisine-accent bottom border. Title block: cuisine badge (solid accent), tag chips, 32px title, description; right rail: save button (rust → green "✓ In your cookbook" once saved) + meta line.
When saved, an organization panel (`#faf5ec`, 12px radius) appears:
- **COLLECTIONS** row: toggle chips (green when in collection, label gains "✓").
- **MY TAGS** row: user's custom tags as rust chips with × remove; inline input (placeholder "add a tag…", Enter submits) + dark "+ Add" pill. Custom tags merge into the recipe's tag list and into Cookbook filters.
Body: 280px/1fr grid — Ingredients (checkbox list, rust accent-color checkboxes) + "Per serving" nutrition panel (cal/protein/carbs/fat); Method (numbered dark circles, 14px/1.6 steps).

### 4. ✦ Create (AI recipe generation)
Centered 860px. Green "✦ AI RECIPE CREATION" badge, title "What are you craving?".
Form card: craving textarea; Cuisine chips ("Surprise me" + 10 cuisines, single-select, green active); Time (15/30/45/1hr+) and Skill (Beginner/Comfortable/Adventurous) single-select chips; "Ingredients on hand (optional)" input; footer shows "Uses your profile: {diet · allergies · goal}" + rust "✦ Create my recipe" button.
States: loading (spinner + "Consulting the flavor archives…"), error (inline red text), result — green-bordered card with "✦ NEW CREATION · {cuisine}" badge, title/desc/meta, ingredients + numbered method, buttons "♡ Save to cookbook" (→ "✓ Saved") and "↻ Try another".

### 5. Daily
Two columns: sticky 340px settings panel + content.
- **Settings** ("Daily recipe settings" — "Every day Ember invents one new recipe from these parameters."): Cuisines (multi, rust), Dietary (multi, green), Time budget (single), Skill (single), Nutrition goal (single, gold: Balanced/High protein/Low calorie/Heart healthy/No goal), "Usually on hand" free-text, **Email delivery** toggle — green "✓ Emailing daily to {email}" when on; "+ Add your email to enable" (routes to profile) when no email; helper text "Each morning Ember will autonomously create your recipe and send it to your inbox."
- **Today's card**: dark `#241a12`, gold badge "{CUISINE} · {meta}", 30px title, description, "View full recipe →" (gold) + "♡ Save". Header row has rust "✦ Generate today's recipe" / "↻ Regenerate today's" button; spinner state while generating. Info strip explains the daily automation.

### 6. Cookbook
Title "{Name}'s cookbook" + count. Cookbook-scoped search bar; **collection filter chips** (All + user collections); **tag filter chips** (# prefixed, from all tags incl. custom, multi-AND). Grid of saved cards (photo thumb, cuisine, collections label in mono, title, meta). Empty state: dashed card "Nothing here yet" + "Browse recipes" CTA.

### 7. Profile wizard (4 steps, 680px centered)
Progress: 4 segmented 5px bars (rust fill). Card per step, footer "← Back" (hidden on step 1) + rust "Continue →" / "✓ Finish setup".
1. **Basics**: 92px circular avatar upload slot + name input + email input ("you@email.com — for daily recipe delivery"); "Cuisines you love" multi chips (rust).
2. **Diet & allergies**: diet multi chips (green; "None" clears) + allergies free-text.
3. **Skill & time**: skill single + weeknight time budget single.
4. **Goals**: nutrition goal chips (gold) + live profile review sentence.

## Interactions & Behavior
- SPA navigation via state (no page loads). Detail remembers previous screen for Back.
- All chip groups: single-select replaces, multi-select toggles; instant visual feedback (filled vs outlined).
- Search: live filtering on keystroke; "AI create" pre-fills the craving from the query.
- Save toggles everywhere update the nav Cookbook badge immediately.
- Photo upload: drag-and-drop or click-to-browse on recipe detail hero and avatar; uploaded photo propagates to every thumbnail of that recipe (cookbook, discover, web minis, daily card, hero) and the nav avatar.
- Generation loading: 44px spinner (rust track), status line; errors are friendly inline text, never blocking.
- Responsive: fluid `auto-fill/minmax` grids; hero and detail grids collapse acceptably; production should add explicit breakpoints (<760px: stack hero, settings above daily card, wizard full-width).

## State Management (prototype → production mapping)
Prototype persists to localStorage; production should persist per-user server-side:
- `profile`: { name, email, emailDaily, cuisines[], diets[], allergies, skill, time, goal, onboarded } (`ember_profile`)
- `savedIds[]` (`ember_saved`), `collections`: { name → recipeId[] } (`ember_collections`)
- `customRecipes[]` — AI-created recipes (`ember_custom`)
- `customTags`: { recipeId → tags[] } (`ember_tags`)
- `daily`: { date, recipe } (`ember_daily`), `dailyOnHand` (`ember_daily_onhand`)
- `sites[]` — followed domains (`ember_sites`)
- Photos: `.image-slots.state.json` keyed `photo-{recipeId}` / `avatar` (data-URLs) — replace with object storage + CDN URLs.

Recipe shape:
```json
{ "id": "r1", "title": "", "cuisine": "", "mins": 30, "time": "30 min",
  "difficulty": "Beginner|Comfortable|Adventurous", "rating": "4.9", "reviews": 0,
  "desc": "", "tags": [], "ingredients": ["qty ingredient"], "steps": [],
  "nutrition": { "cal": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "source": "domain.com (optional, web-sourced)", "custom": true }
```

## Backend Specification (to build)
1. **Auth & profiles** — email-based auth; profile table mirroring the shape above; avatar upload to object storage.
2. **Recipes** — tables: recipes, saves, collections, collection_items, tags (user-scoped), recipe_photos. Seed catalog + user-created recipes.
3. **AI generation service** — endpoint wrapping Claude (Messages API). The prototype's prompt (see `recipePrompt()` in the HTML) works well: pass user parameters + profile (favorite cuisines, diets, allergies, skill, nutrition goal), instruct "respect dietary restrictions strictly", demand strict-JSON output in the recipe shape above; validate/parse server-side, retry on malformed JSON.
4. **Real web search** — replace the simulated "Fresh from the web": per followed site, fetch latest recipes (RSS feeds where available, else scraping/search API), normalize into the recipe shape with `source` set, cache, dedupe. Endpoint to validate + follow a new domain.
5. **Daily recipe automation** — per-user scheduled job (user-local morning): build params from profile + daily settings, call generation service, store as recipe-of-the-day, expose via API, and **send email** (Resend/SES/Postmark) when `emailDaily` is true — a nicely formatted recipe email matching the brand tokens above. Regeneration endpoint replaces today's.
6. **Rate limiting & cost control** — cap generations per user/day; queue daily jobs.

## Assets
No binary assets. Fonts from Google Fonts (Archivo, IBM Plex Mono). All imagery in the prototype is placeholder; `image-slot.js` shows the intended upload UX only.

## Files
- `Ember Prototype.dc.html` — full prototype: markup + styles (template section) and all logic/seed data/prompts (script section)
- `image-slot.js` — image upload component (prototype persistence)
- `screenshots/` — viewport captures of each screen (top of page; open the prototype for full pages and interactive states):
  - `01-discover.png` — Discover home (hero, search, chips, grid)
  - `02-recipe-detail.png` — Recipe detail with photo drop-zone
  - `03-ai-create.png` — AI creation form
  - `04-daily.png` — Daily recipe + settings panel
  - `05-cookbook.png` — Cookbook library
  - `06-profile-wizard.png` — Profile wizard step 1 (avatar + email)
