'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipeApi, cookbookApi } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Collection, Recipe } from '@/lib/types';
import { C, mono, chipStyle, thumbBackground } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';

export default function CookbookPage() {
  const router = useRouter();
  const { profile } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [query, setQuery] = useState('');
  const [activeCollection, setActiveCollection] = useState('All');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ recipes }, { collections }] = await Promise.all([recipeApi.list({ scope: 'saved' }), cookbookApi.collections()]);
      setRecipes(recipes);
      setCollections(collections);
      setLoading(false);
    })();
  }, []);

  const allTags = useMemo(() => Array.from(new Set(recipes.flatMap((r) => r.tags))).slice(0, 10), [recipes]);

  const collectionOf = (id: string) => collections.filter((c) => c.recipeIds.includes(id)).map((c) => c.name);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (activeCollection !== 'All') {
        const col = collections.find((c) => c.name === activeCollection);
        if (!col || !col.recipeIds.includes(r.id)) return false;
      }
      if (activeTags.length && !activeTags.every((t) => r.tags.includes(t))) return false;
      if (q && !`${r.title} ${r.cuisine} ${r.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recipes, collections, query, activeCollection, activeTags]);

  const toggleTag = (t: string) => setActiveTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const possessive = profile?.name ? `${profile.name}’s` : 'Your';

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 28px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>{possessive} cookbook</div>
        <div style={{ fontSize: 13, color: C.muted55, fontWeight: 500 }}>{recipes.length} saved recipes</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.surface, border: `1.5px solid ${C.line15}`, borderRadius: 14, padding: '4px 20px', marginBottom: 18 }}>
        <span style={{ fontSize: 15, color: C.rust }}>⌕</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your cookbook…" style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, padding: '12px 0', color: C.ink }} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {['All', ...collections.map((c) => c.name)].map((n) => (
          <button key={n} style={chipStyle(activeCollection === n, C.dark, true)} onClick={() => setActiveCollection(n)}>{n}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 26 }}>
        {allTags.map((t) => (
          <button key={t} style={chipStyle(activeTags.includes(t), C.rust, true)} onClick={() => toggleTag(t)}>#{t}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', background: C.surface, border: `1.5px dashed ${C.line22}`, borderRadius: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Nothing here yet</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 18 }}>Save recipes from Discover, or create something new.</div>
          <button onClick={() => router.push('/discover')} style={{ background: C.rust, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '12px 26px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            Browse recipes
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(255px,1fr))', gap: 18 }}>
          {filtered.map((r) => (
            <div key={r.id} className="ember-card" onClick={() => router.push(`/recipe/${r.id}`)} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', borderTop: `4px solid ${r.accent}` }}>
              <div style={{ height: 120, background: thumbBackground(r.photo), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!r.photo && <span style={{ fontFamily: mono, fontSize: 11, color: 'rgba(36,26,18,0.4)' }}>dish photo</span>}
              </div>
              <div style={{ padding: '15px 17px 17px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: r.accent }}>{r.cuisine}</span>
                  <span style={{ fontSize: 11, fontFamily: mono, color: 'rgba(36,26,18,0.5)' }}>{collectionOf(r.id).join(', ')}</span>
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.22, letterSpacing: -0.3, marginBottom: 7 }}>{r.title}</div>
                <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{r.meta}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
