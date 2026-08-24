import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicRecipe, shareUrl, type PublicRecipe } from '@/lib/server/services/sharing';
import { config } from '@/lib/server/config';
import { C, accentFor } from '@/lib/tokens';
import { deriveEquipment } from '@/lib/equipment';
import { KitchenIcon } from '@/components/KitchenIcons';
import { Wordmark } from '@/components/Wordmark';
import { PublicRecipeActions } from '@/components/PublicRecipeActions';
import { NutritionPanel } from '@/components/NutritionPanel';
import { getStoredNutrition } from '@/lib/server/services/nutritionCalc';

// Published recipes change rarely; cache the rendered page and let a re-share
// or edit roll it over within the hour.
export const revalidate = 3600;

type Props = { params: { slug: string } };

/** On-page hero (600×400) vs the wide 1200×630 frame social crawlers crop to. */
const imageUrl = (r: PublicRecipe, og = false): string =>
  r.photo_url ?? `${config.publicOrigin}/api/img/recipe/${r.id}${og ? '?og=1' : ''}`;

/** ISO 8601 duration for structured data — Google rejects "30 min". */
const isoDuration = (mins: number): string =>
  mins >= 60 ? `PT${Math.floor(mins / 60)}H${mins % 60 ? `${mins % 60}M` : ''}` : `PT${mins}M`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recipe = await getPublicRecipe(params.slug);
  if (!recipe) return { title: 'Recipe not found — TastyEmber' };
  const url = shareUrl(recipe.share_slug);
  const description = recipe.description || `A ${recipe.cuisine} recipe — ${recipe.time_label}, ${recipe.difficulty.toLowerCase()}.`;
  return {
    title: `${recipe.title} — TastyEmber`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: recipe.title,
      description,
      siteName: 'TastyEmber',
      // 1200×630 is the size every social crawler crops to cleanly.
      images: [{ url: imageUrl(recipe, true), width: 1200, height: 630, alt: recipe.title }],
    },
    twitter: { card: 'summary_large_image', title: recipe.title, description, images: [imageUrl(recipe, true)] },
  };
}

/**
 * The one page TastyEmber shows the open web: a read-only recipe anyone can
 * open, with schema.org Recipe markup so it can earn a rich result. Saving,
 * planning, shopping and the cook's own data all stay behind the sign-in wall —
 * the only door out of here is "make your own version".
 */
export default async function PublicRecipePage({ params }: Props) {
  const recipe = await getPublicRecipe(params.slug);
  if (!recipe) notFound();

  const accent = accentFor(recipe.cuisine);
  const url = shareUrl(recipe.share_slug);
  const nutrition = (recipe.nutrition ?? {}) as { cal?: string | number; protein?: string | number; carbs?: string | number; fat?: string | number };
  const equipment = deriveEquipment(recipe.ingredients ?? [], recipe.steps ?? []);
  const hasRating = recipe.stars_count > 0 && recipe.stars_avg != null;
  // Read-only here: a crawler or a stranger shouldn't trigger USDA lookups, so
  // the public page shows a calculation only once the app has made one.
  const calculated = await getStoredNutrition(recipe.id).catch(() => null);
  const macros = calculated?.perServing ?? nutrition;

  // Structured data mirrors exactly what's rendered below — Google penalises
  // markup that claims more than the page shows.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    image: [imageUrl(recipe, true), imageUrl(recipe)],
    description: recipe.description || undefined,
    author: { '@type': 'Organization', name: 'TastyEmber' },
    datePublished: (recipe.shared_at ?? undefined) && new Date(recipe.shared_at!).toISOString().slice(0, 10),
    recipeCuisine: recipe.cuisine,
    recipeCategory: 'Main course',
    keywords: (recipe.tags ?? []).join(', ') || undefined,
    totalTime: isoDuration(recipe.mins),
    cookTime: isoDuration(recipe.mins),
    recipeYield: '4 servings',
    recipeIngredient: recipe.ingredients ?? [],
    recipeInstructions: (recipe.steps ?? []).map((text, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      // No "Step 1:" prefix — Google wants the instruction text only.
      text,
    })),
    nutrition: macros.cal
      ? {
          '@type': 'NutritionInformation',
          servingSize: '1 serving',
          calories: `${macros.cal} calories`,
          proteinContent: `${macros.protein} g`,
          carbohydrateContent: `${macros.carbs} g`,
          fatContent: `${macros.fat} g`,
        }
      : undefined,
    aggregateRating: hasRating
      ? { '@type': 'AggregateRating', ratingValue: String(recipe.stars_avg), ratingCount: recipe.stars_count, bestRating: '5' }
      : undefined,
    url,
  };

  const label: React.CSSProperties = {
    fontSize: 15, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust, marginBottom: 14,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Public header — a way in, not the app's nav */}
      <header style={{ borderBottom: `1px solid ${C.line}`, background: C.surface }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="TastyEmber home">
            <Wordmark size={19} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/login" style={{ fontSize: 13, fontWeight: 700, color: C.muted75, textDecoration: 'none' }}>
              Sign in
            </Link>
            <Link
              href={`/create?craving=${encodeURIComponent(recipe.title)}`}
              style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: C.rust, padding: '10px 18px', borderRadius: 999, textDecoration: 'none' }}
            >
              ✦ Make your own version
            </Link>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1000, margin: '0 auto', padding: '26px 24px 64px' }}>
        <article style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>
          {/* Hero */}
          <div style={{ borderBottom: `4px solid ${accent}`, position: 'relative', background: C.bg }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by our own image proxy, which 302s to the CDN */}
            <img
              src={imageUrl(recipe)}
              alt={recipe.title}
              width={1000}
              height={340}
              style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }}
            />
          </div>

          <div className="detail-card-pad" style={{ padding: '32px 36px 40px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: '#fff', background: accent, padding: '4px 11px', borderRadius: 4 }}>
                {recipe.cuisine}
              </span>
              {(recipe.tags ?? []).slice(0, 6).map((t) => (
                <span key={t} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted65, background: 'rgba(36,26,18,0.07)', padding: '4px 11px', borderRadius: 999 }}>
                  {t}
                </span>
              ))}
            </div>

            <h1 className="hero-title" style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.9, lineHeight: 1.08, margin: 0 }}>{recipe.title}</h1>
            {recipe.description && (
              <p style={{ fontSize: 15, lineHeight: 1.6, color: C.muted65, margin: '12px 0 0', maxWidth: '62ch' }}>{recipe.description}</p>
            )}

            {/* Facts strip — the numbers a cook scans for before committing */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              {[
                { k: 'Time', v: recipe.time_label },
                { k: 'Skill', v: recipe.difficulty },
                { k: 'Serves', v: '4' },
                ...(macros.cal ? [{ k: 'Per serving', v: `${macros.cal} cal` }] : []),
                ...(hasRating ? [{ k: 'Rated', v: `★ ${recipe.stars_avg} · ${recipe.stars_count}` }] : []),
              ].map((f) => (
                <div key={f.k} style={{ background: C.bg, borderRadius: 12, padding: '10px 14px', minWidth: 92 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted55 }}>{f.k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{f.v}</div>
                </div>
              ))}
            </div>

            <PublicRecipeActions title={recipe.title} url={url} />

            <div className="detail-grid" style={{ marginTop: 32 }}>
              <div>
                <div style={label}>Ingredients</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {(recipe.ingredients ?? []).map((ing, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45 }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flex: 'none', marginTop: 7 }} />
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
                {Boolean(macros.cal) && (
                  <NutritionPanel
                    recipeId={recipe.id}
                    estimate={{ cal: nutrition.cal ?? 0, protein: nutrition.protein ?? 0, carbs: nutrition.carbs ?? 0, fat: nutrition.fat ?? 0 }}
                    initial={calculated}
                    canCalculate={false}
                  />
                )}
              </div>

              <div>
                <div style={label}>Method</div>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {(recipe.steps ?? []).map((s, i) => (
                    <li key={i} style={{ display: 'flex', gap: 14 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.dark, color: C.bg, fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {i + 1}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, paddingTop: 3 }}>{s}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {equipment.length > 0 && (
              <section style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${C.line}` }}>
                <div style={{ ...label, marginBottom: 4 }}>Cooking items needed</div>
                <div style={{ fontSize: 12.5, color: C.muted55, marginBottom: 16 }}>Tools to have ready before you start.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                  {equipment.map((eq) => (
                    <div key={eq.name} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, flex: 'none', background: 'rgba(196,85,45,0.1)', color: C.rust, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <KitchenIcon name={eq.icon} size={22} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{eq.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </article>

        {/* The one conversion moment on the page */}
        <section style={{ marginTop: 22, background: C.dark, color: C.bg, borderRadius: 18, padding: '30px 34px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: '52ch' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: C.gold }}>Make it yours</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, margin: '8px 0 8px' }}>Same dish, cooked your way.</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(250,245,236,0.75)', margin: 0 }}>
              TastyEmber writes you a new version of this recipe around your diet, allergies, skill and the time you actually have —
              then invents a fresh recipe for you every morning.
            </p>
          </div>
          <Link
            href={`/create?craving=${encodeURIComponent(recipe.title)}`}
            style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 14.5, padding: '15px 28px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ✦ Make your own version
          </Link>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: '20px 24px', textAlign: 'center', fontSize: 12.5, color: C.muted55 }}>
        Shared from <Link href="/" style={{ color: C.rust, fontWeight: 700, textDecoration: 'none' }}>TastyEmber</Link> — your AI recipe kitchen.
      </footer>
    </div>
  );
}
