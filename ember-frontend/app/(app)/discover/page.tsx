'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipeApi, sitesApi, dailyApi, cookbookApi, ApiError, type WebRecipeLink } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C, mono, todayLabel, recipeImageUrl } from '@/lib/tokens';
import { RecipeCard } from '@/components/RecipeCard';
import { Spinner } from '@/components/Spinner';
import { CuisineChips } from '@/components/CuisineChips';

const PAGE_SIZE = 8; // 2 rows × 4 columns
const SPARK_PAGE_SIZE = 6; // 2 rows × 3 columns (6 clean rows on mobile)

/** One card in the combined Fresh Sparks feed. */
interface SparkItem {
  key: string;
  title: string;
  snippet?: string;
  image?: string;
  source: string;
  href: string;
  external: boolean; // live web find (opens the source) vs followed-site recipe (opens in-app)
  following?: boolean;
}

const sparkPagerBtn = (off: boolean): React.CSSProperties => ({
  fontFamily: 'inherit', fontSize: 15, fontWeight: 800, width: 28, height: 28, borderRadius: '50%', padding: 0,
  border: '1.5px solid rgba(36,26,18,0.22)', background: 'transparent', color: 'rgba(36,26,18,0.75)',
  cursor: off ? 'default' : 'pointer', opacity: off ? 0.35 : 1, lineHeight: 1,
});

const pagerStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 999,
  border: '1.5px solid rgba(36,26,18,0.22)', background: 'transparent', color: '#241a12',
};

/** Fisher–Yates shuffle so the library feels fresh on each page load. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function DiscoverPage() {
  const router = useRouter();
  const { profile, refreshSavedCount } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [freshRecipes, setFreshRecipes] = useState<Recipe[]>([]);
  const [webFinds, setWebFinds] = useState<WebRecipeLink[]>([]);
  const [webRecipes, setWebRecipes] = useState<Recipe[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [hero, setHero] = useState<Recipe | null>(null);
  const [heroSaved, setHeroSaved] = useState(false);
  const [q, setQ] = useState('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [newSite, setNewSite] = useState('');
  const [siteLoading, setSiteLoading] = useState<string | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sparkPage, setSparkPage] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Fresh Sparks = the latest from followed sites (in-app recipes) + live web
  // finds, one combined feed. Followed sites lead — the user chose those.
  const sparkItems = useMemo<SparkItem[]>(
    () => [
      ...webRecipes.map((w) => ({
        key: `r-${w.id}`, title: w.title, snippet: w.desc || undefined, image: recipeImageUrl(w),
        source: w.source ?? '', href: `/recipe/${w.id}`, external: false, following: true,
      })),
      ...webFinds.map((w) => ({
        key: `w-${w.url}`, title: w.title, snippet: w.snippet || undefined, image: w.image,
        source: w.source, href: w.url, external: true,
      })),
    ],
    [webRecipes, webFinds],
  );
  const sparkPages = Math.ceil(sparkItems.length / SPARK_PAGE_SIZE);
  useEffect(() => setSparkPage(0), [sparkItems.length]);
  const sparkPageItems = sparkItems.slice(sparkPage * SPARK_PAGE_SIZE, (sparkPage + 1) * SPARK_PAGE_SIZE);

  const loadWeb = useCallback(async () => {
    const [web, s] = await Promise.all([recipeApi.list({ scope: 'web' }), sitesApi.list()]);
    setWebRecipes(shuffle(web.recipes)); // vary the order each visit
    setSites(s.sites);
  }, []);

  // initial load: hero (today's daily or featured), personalized fresh feed
  // (recent TastyEmber creations + live web finds), followed-sites section
  useEffect(() => {
    (async () => {
      try {
        const [daily, fresh] = await Promise.all([dailyApi.today(), recipeApi.fresh()]);
        const featured = fresh.recipes.find((r) => r.title.includes('Miso Salmon')) ?? fresh.recipes[0] ?? null;
        const h = daily.daily ?? featured;
        setHero(h);
        setHeroSaved(h?.saved ?? false);
        setFreshRecipes(fresh.recipes);
        setWebFinds(fresh.web);
        setRecipes(fresh.recipes);
        await loadWeb();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWeb]);

  // reactive results (live search + multi-cuisine filter); no filter → the
  // personalized fresh feed
  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim() && cuisines.length === 0) {
      setRecipes(freshRecipes);
      setPage(0);
      return;
    }
    debounce.current = setTimeout(async () => {
      const { recipes } = await recipeApi.list({
        scope: 'discover',
        q: q.trim() || undefined,
        cuisine: cuisines.length ? cuisines.join(',') : undefined,
      });
      // Shuffle so cuisine browsing refreshes each load; searches stay ordered.
      setRecipes(q.trim() ? recipes : shuffle(recipes));
      setPage(0);
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [q, cuisines, freshRecipes]);

  async function toggleHeroSave() {
    if (!hero) return;
    const res = heroSaved ? await cookbookApi.unsave(hero.id) : await cookbookApi.save(hero.id);
    setHeroSaved(res.saved);
    useApp.getState().setSavedCount(res.count);
  }

  async function addSite() {
    const domain = newSite.trim();
    if (!domain) return;
    setSiteError(null);
    setSiteLoading(domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);
    try {
      await sitesApi.follow(domain);
      setNewSite('');
      await loadWeb();
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.message : `Couldn't fetch from ${domain} right now — try again.`);
      await loadWeb(); // the site may still have been followed
    } finally {
      setSiteLoading(null);
    }
  }

  async function removeSite(domain: string) {
    await sitesApi.unfollow(domain);
    await loadWeb();
  }

  const resultsHeading = q.trim()
    ? `Results for “${q.trim()}”`
    : cuisines.length === 0
      ? 'Fresh from the kitchen'
      : `${cuisines.join(' · ')} recipes`;

  const heroDesc = hero?.origin === 'daily'
    ? hero.desc
    : `Built around your love of ${profile?.cuisines[0] ?? 'bold'} flavors, ready in the ${profile?.time ?? '30 min'} you have tonight.`;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="ember-wrap">
      {/* hero */}
      {hero && (
        <div className="hero-grid" style={{ borderRadius: 18, overflow: 'hidden', background: C.rust, color: '#fff' }}>
          <div className="hero-copy" style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 15 }}>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 800, color: '#ffd9a3' }}>
              Your daily creation · {todayLabel()}
            </div>
            <div className="hero-title" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>{hero.title}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.82)', maxWidth: '44ch' }}>{heroDesc}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              <button onClick={() => router.push(`/recipe/${hero.id}`)} style={{ background: C.dark, color: C.bg, fontWeight: 700, fontSize: 14, padding: '13px 26px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Cook tonight →
              </button>
              <button onClick={toggleHeroSave} style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.5)', color: '#fff', fontWeight: 600, fontSize: 14, padding: '11px 22px', borderRadius: 999, cursor: 'pointer' }}>
                {heroSaved ? '✓ Saved' : '♡ Save to cookbook'}
              </button>
            </div>
          </div>
          <div className="hero-photo" style={{ background: `#b04c26 url("${recipeImageUrl(hero)}") center/cover no-repeat`, minHeight: 280 }} />

        </div>
      )}

      {/* search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.surface, border: `1.5px solid ${C.line15}`, borderRadius: 14, padding: '6px 8px 6px 20px', margin: '26px 0 22px', boxShadow: '0 1px 3px rgba(36,26,18,0.05)' }}>
        <span style={{ fontSize: 16, color: C.rust }}>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipes, cuisines, ingredients — or describe a craving…"
          style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14.5, padding: '12px 0', color: C.ink }}
        />
        <button onClick={() => router.push(`/create?craving=${encodeURIComponent(q)}`)} style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', background: C.green, padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', flex: 'none' }}>
          ✦ AI create
        </button>
      </div>

      {/* cuisine filters — every cuisine from Create/Daily, multi-select, wrapped
          chips with a "+N more" expander (favourites first) */}
      <div style={{ marginBottom: 22 }}>
        <CuisineChips
          selected={cuisines}
          onToggle={(c) => { setCuisines((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])); setQ(''); }}
          onClear={() => { setCuisines([]); setQ(''); }}
          allLabel="All"
          activeColor={C.dark}
          favorites={profile?.cuisines ?? []}
          small={false}
        />
      </div>

      {/* results */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{resultsHeading}</div>
        <div style={{ fontSize: 12.5, color: C.muted55, fontWeight: 500 }}>{recipes.length} recipes</div>
      </div>
      <div style={{ fontSize: 13, color: C.muted65, lineHeight: 1.5, marginBottom: 18, maxWidth: '70ch' }}>
        {q.trim()
          ? 'Matching recipes from your personal library and the TastyEmber catalog.'
          : cuisines.length > 0
            ? `Recipes from the TastyEmber catalog and your own AI creations in ${cuisines.length > 1 ? 'these cuisines' : 'this cuisine'}. Tap the bookmark to save one straight to your cookbook.`
            : profile?.cuisines.length
              ? `Freshly created TastyEmber recipes and live finds from around the web — personalized to your tastes (${profile.cuisines.slice(0, 4).join(', ')}${profile.cuisines.length > 4 ? '…' : ''}). Tap the bookmark to save a recipe straight to your cookbook.`
              : 'Freshly created TastyEmber recipes and live finds from around the web. Pick favourite cuisines in your profile to personalize this feed.'}
      </div>

      <div className="kitchen-grid">
        {recipes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((r) => (
          <RecipeCard key={r.id} r={r} showTags showSaveToggle />
        ))}
      </div>
      {recipes.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 24 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ ...pagerStyle, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'default' : 'pointer' }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.muted75 }}>
            Page {page + 1} of {Math.ceil(recipes.length / PAGE_SIZE)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(recipes.length / PAGE_SIZE) - 1, p + 1))}
            disabled={page >= Math.ceil(recipes.length / PAGE_SIZE) - 1}
            style={{ ...pagerStyle, opacity: page >= Math.ceil(recipes.length / PAGE_SIZE) - 1 ? 0.4 : 1, cursor: page >= Math.ceil(recipes.length / PAGE_SIZE) - 1 ? 'default' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Fresh Sparks — one combined, paginated feed: the latest posts from
          the user's followed sites + live finds from the web's best kitchens.
          Site management lives inline at the bottom of the card. */}
      {!q.trim() && cuisines.length === 0 && (
        <div style={{ marginTop: 36, padding: '20px 20px 16px', background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(36,26,18,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.4 }}>✨ Fresh Sparks</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: 'rgba(36,26,18,0.5)', marginTop: 2 }}>
                new from your sites &amp; the web’s best kitchens — picked for your tastes
              </div>
            </div>
            {sparkPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                <button onClick={() => setSparkPage((p) => Math.max(0, p - 1))} disabled={sparkPage === 0} aria-label="Previous sparks" style={sparkPagerBtn(sparkPage === 0)}>‹</button>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.muted65 }}>{sparkPage + 1}/{sparkPages}</span>
                <button onClick={() => setSparkPage((p) => Math.min(sparkPages - 1, p + 1))} disabled={sparkPage >= sparkPages - 1} aria-label="Next sparks" style={sparkPagerBtn(sparkPage >= sparkPages - 1)}>›</button>
              </div>
            )}
          </div>

          {sparkPageItems.length > 0 && (
            <div className="spark-grid">
              {sparkPageItems.map((w) => (
                <a
                  key={w.key}
                  href={w.href}
                  target={w.external ? '_blank' : undefined}
                  rel={w.external ? 'noopener noreferrer' : undefined}
                  onClick={w.external ? undefined : (e) => { e.preventDefault(); router.push(w.href); }}
                  className="spark-card ember-card"
                  style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', color: C.ink }}
                >
                  <div
                    className="spark-thumb"
                    style={{
                      background: w.image
                        ? `#e9dfcc url("${w.image}") center/cover no-repeat`
                        : 'linear-gradient(135deg, rgba(196,85,45,0.16), rgba(232,161,60,0.22))',
                    }}
                  >
                    {!w.image && <span style={{ fontSize: 24 }}>🍳</span>}
                  </div>
                  <div className="spark-body">
                    <div className="spark-title" style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>{w.title}</div>
                    {w.snippet && <div className="spark-snippet" style={{ fontSize: 11.5, color: C.muted65, lineHeight: 1.5 }}>{w.snippet}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 6, minWidth: 0 }}>
                      {w.source && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(w.source)}&sz=32`}
                          alt=""
                          width={14}
                          height={14}
                          style={{ borderRadius: 4, flex: 'none' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: C.green, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.source}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: w.following ? C.green : C.muted55, flex: 'none' }}>
                        {w.following ? '✓ following' : '↗'}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* followed-sites management */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, flex: 'none' }}>My sites</span>
            {sites.map((d) => (
              <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: mono, fontSize: 11.5, fontWeight: 500, color: C.green, background: 'rgba(47,122,77,0.1)', border: '1px solid rgba(47,122,77,0.3)', padding: '5px 7px 5px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                {d}
                <button onClick={() => removeSite(d)} title="Remove site" style={{ border: 'none', background: 'rgba(47,122,77,0.2)', color: C.green, width: 16, height: 16, borderRadius: '50%', fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                  ×
                </button>
              </span>
            ))}
            <input
              value={newSite}
              onChange={(e) => { setNewSite(e.target.value); setSiteError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void addSite(); }}
              placeholder="follow a site — e.g. smittenkitchen.com"
              style={{ border: `1.5px solid ${C.line22}`, borderRadius: 999, padding: '7px 14px', fontFamily: mono, fontSize: 11.5, background: C.bg, color: C.ink, width: 230 }}
            />
            <button onClick={addSite} style={{ border: 'none', background: C.green, color: '#fff', fontWeight: 800, fontSize: 12, padding: '8px 15px', borderRadius: 999, cursor: 'pointer' }}>
              + Add
            </button>
          </div>
          {siteLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.green }}>
              <Spinner size={16} color={C.green} />
              fetching the latest from {siteLoading}…
            </div>
          )}
          {siteError && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{siteError}</div>}
        </div>
      )}
    </div>
  );
}
