'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipeApi, sitesApi, dailyApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C, CUISINES, mono, chipStyle, todayLabel, recipeImageUrl } from '@/lib/tokens';
import { RecipeCard } from '@/components/RecipeCard';
import { Spinner } from '@/components/Spinner';

export default function DiscoverPage() {
  const router = useRouter();
  const { profile, refreshSavedCount } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [webRecipes, setWebRecipes] = useState<Recipe[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [hero, setHero] = useState<Recipe | null>(null);
  const [heroSaved, setHeroSaved] = useState(false);
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [newSite, setNewSite] = useState('');
  const [siteLoading, setSiteLoading] = useState<string | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const loadWeb = useCallback(async () => {
    const [web, s] = await Promise.all([recipeApi.list({ scope: 'web' }), sitesApi.list()]);
    setWebRecipes(web.recipes);
    setSites(s.sites);
  }, []);

  // initial load: hero (today's daily or featured), web section
  useEffect(() => {
    (async () => {
      try {
        const [daily, disc] = await Promise.all([dailyApi.today(), recipeApi.list({ scope: 'discover' })]);
        const featured = disc.recipes.find((r) => r.title.includes('Miso Salmon')) ?? disc.recipes[0] ?? null;
        const h = daily.daily ?? featured;
        setHero(h);
        setHeroSaved(h?.saved ?? false);
        await loadWeb();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWeb]);

  // reactive results (live search + cuisine filter)
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const { recipes } = await recipeApi.list({
        scope: 'discover',
        q: q.trim() || undefined,
        cuisine: cuisine !== 'All' ? cuisine : undefined,
      });
      setRecipes(recipes);
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [q, cuisine]);

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
    : cuisine === 'All'
      ? 'Fresh from the kitchen'
      : `${cuisine} recipes`;

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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' }}>
      {/* hero */}
      {hero && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1.1fr) minmax(260px,1fr)', borderRadius: 18, overflow: 'hidden', background: C.rust, color: '#fff' }}>
          <div style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 15 }}>
            <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 800, color: '#ffd9a3' }}>
              Your daily creation · {todayLabel()}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>{hero.title}</div>
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
          <div style={{ background: `#b04c26 url("${recipeImageUrl(hero)}") center/cover no-repeat`, minHeight: 280 }} />

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

      {/* cuisine chips */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 26, flexWrap: 'wrap' }}>
        {['All', ...CUISINES.slice(0, 7)].map((c) => (
          <button key={c} style={chipStyle(cuisine === c, C.dark, false)} onClick={() => { setCuisine(c); setQ(''); }}>
            {c}
          </button>
        ))}
      </div>

      {/* results */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{resultsHeading}</div>
        <div style={{ fontSize: 12.5, color: C.muted55, fontWeight: 500 }}>{recipes.length} recipes</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(255px,1fr))', gap: 18 }}>
        {recipes.map((r) => (
          <RecipeCard key={r.id} r={r} />
        ))}
      </div>

      {/* from the web */}
      {!q.trim() && (
        <div style={{ marginTop: 40, padding: '22px 24px', background: C.surface, border: `1.5px dashed ${C.line22}`, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Fresh from the web</div>
            <div style={{ fontFamily: mono, fontSize: 11, color: 'rgba(36,26,18,0.5)' }}>latest recipes from the sites you follow</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>My sites</span>
            {sites.map((d) => (
              <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: mono, fontSize: 11.5, fontWeight: 500, color: C.green, background: 'rgba(47,122,77,0.1)', border: '1px solid rgba(47,122,77,0.3)', padding: '5px 7px 5px 12px', borderRadius: 999 }}>
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
              placeholder="add a site — e.g. smittenkitchen.com"
              style={{ border: `1.5px solid ${C.line22}`, borderRadius: 999, padding: '7px 14px', fontFamily: mono, fontSize: 11.5, background: C.bg, color: C.ink, width: 230 }}
            />
            <button onClick={addSite} style={{ border: 'none', background: C.green, color: '#fff', fontWeight: 800, fontSize: 12, padding: '8px 15px', borderRadius: 999, cursor: 'pointer' }}>
              + Add site
            </button>
          </div>
          {siteLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.green }}>
              <Spinner size={16} color={C.green} />
              fetching the latest from {siteLoading}…
            </div>
          )}
          {siteError && <div style={{ marginTop: 10, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{siteError}</div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            {webRecipes.map((w) => (
              <div key={w.id} className="ember-webmini" onClick={() => router.push(`/recipe/${w.id}`)} style={{ flex: 1, minWidth: 240, display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, cursor: 'pointer' }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, flex: 'none', background: `#e9dfcc url("${recipeImageUrl(w)}") center/cover no-repeat` }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25 }}>{w.title}</div>
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: C.green, marginTop: 3 }}>{w.source}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
