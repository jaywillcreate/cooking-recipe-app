'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipeApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Collection, Recipe } from '@/lib/types';
import { C, chipStyle } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { RecipeCard } from '@/components/RecipeCard';

export default function CookbookPage() {
  const router = useRouter();
  const { profile } = useApp();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [query, setQuery] = useState('');
  const [activeCollection, setActiveCollection] = useState('All');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCollection, setNewCollection] = useState('');
  const [collErr, setCollErr] = useState<string | null>(null);

  async function reload() {
    const [{ recipes }, { collections }] = await Promise.all([recipeApi.list({ scope: 'saved' }), cookbookApi.collections()]);
    setRecipes(recipes);
    setCollections(collections);
  }
  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(() => Array.from(new Set(recipes.flatMap((r) => r.tags))).slice(0, 12), [recipes]);
  const collectionsOf = (id: string) => collections.filter((c) => c.recipeIds.includes(id));

  // Apply search + tag filters (collection filtering handled by the view below).
  const searchTagFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (activeTags.length && !activeTags.every((t) => r.tags.includes(t))) return false;
      if (q && !`${r.title} ${r.cuisine} ${r.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recipes, query, activeTags]);

  const toggleTag = (t: string) => setActiveTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const possessive = profile?.name ? `${profile.name}’s` : 'Your';

  async function createCollection() {
    const name = newCollection.trim();
    if (!name) return;
    setCollErr(null);
    try {
      await cookbookApi.createCollection(name);
      setNewCollection('');
      await reload();
    } catch (e) {
      setCollErr(e instanceof ApiError ? e.message : 'Could not create that section.');
    }
  }
  async function deleteCollection(id: string, name: string) {
    if (!confirm(`Delete the "${name}" section? Your saved recipes stay in your cookbook.`)) return;
    await cookbookApi.deleteCollection(id);
    if (activeCollection === name) setActiveCollection('All');
    await reload();
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;

  // Build the sections to render.
  const grouped = activeCollection === 'All';
  let sections: { id: string | null; name: string; items: Recipe[] }[] = [];
  if (grouped) {
    sections = collections.map((c) => ({
      id: c.id,
      name: c.name,
      items: searchTagFiltered.filter((r) => c.recipeIds.includes(r.id)),
    }));
    const inAny = new Set(collections.flatMap((c) => c.recipeIds));
    const unsorted = searchTagFiltered.filter((r) => !inAny.has(r.id));
    if (unsorted.length) sections.push({ id: null, name: 'Unsorted', items: unsorted });
  } else {
    const col = collections.find((c) => c.name === activeCollection);
    sections = [{ id: col?.id ?? null, name: activeCollection, items: searchTagFiltered.filter((r) => (col ? col.recipeIds.includes(r.id) : false)) }];
  }
  const anyResults = sections.some((s) => s.items.length > 0);

  return (
    <div className="ember-wrap">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>{possessive} cookbook</div>
        <div style={{ fontSize: 13, color: C.muted55, fontWeight: 500 }}>{recipes.length} saved · {collections.length} sections</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.surface, border: `1.5px solid ${C.line15}`, borderRadius: 14, padding: '4px 20px', marginBottom: 16 }}>
        <span style={{ fontSize: 15, color: C.rust }}>⌕</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your cookbook…" style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, padding: '12px 0', color: C.ink }} />
      </div>

      {/* Section filter + create */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <button style={chipStyle(activeCollection === 'All', C.dark, true)} onClick={() => setActiveCollection('All')}>All sections</button>
        {collections.map((c) => (
          <button key={c.id} style={chipStyle(activeCollection === c.name, C.dark, true)} onClick={() => setActiveCollection(c.name)}>
            {c.name} <span style={{ opacity: 0.6 }}>{c.recipeIds.length}</span>
          </button>
        ))}
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            value={newCollection}
            onChange={(e) => { setNewCollection(e.target.value); setCollErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void createCollection(); }}
            placeholder="+ New section"
            style={{ border: `1.5px solid ${C.line22}`, borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, background: C.bg, color: C.ink, width: 150 }}
          />
          <button onClick={createCollection} style={{ border: 'none', background: C.green, color: '#fff', fontWeight: 800, fontSize: 12, padding: '8px 14px', borderRadius: 999, cursor: 'pointer' }}>Add</button>
        </span>
      </div>
      {collErr && <div style={{ fontSize: 12.5, color: C.error, marginBottom: 12 }}>{collErr}</div>}

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 26 }}>
          {allTags.map((t) => (
            <button key={t} style={chipStyle(activeTags.includes(t), C.rust, true)} onClick={() => toggleTag(t)}>#{t}</button>
          ))}
        </div>
      )}

      {recipes.length === 0 ? (
        <EmptyState onBrowse={() => router.push('/discover')} />
      ) : !anyResults ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: C.surface, border: `1.5px dashed ${C.line22}`, borderRadius: 18, color: C.muted }}>
          Nothing matches these filters.
        </div>
      ) : (
        sections
          .filter((s) => grouped ? s.items.length > 0 : true)
          .map((s) => (
            <section key={s.id ?? 'unsorted'} style={{ marginBottom: 34 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: C.muted55, fontWeight: 600 }}>{s.items.length}</div>
                {s.id && (
                  <button onClick={() => deleteCollection(s.id!, s.name)} title="Delete this section" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.muted55, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Delete section
                  </button>
                )}
              </div>
              {s.items.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted55, padding: '4px 0 8px' }}>No recipes here yet — open a recipe and add it to “{s.name}”.</div>
              ) : (
                <div className="kitchen-grid">
                  {s.items.map((r) => (
                    <RecipeCard key={r.id} r={r} thumbHeight={120} showTags showSaveToggle rightLabel={collectionsOf(r.id).map((c) => c.name).join(', ')} />
                  ))}
                </div>
              )}
            </section>
          ))
      )}
    </div>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '70px 20px', background: C.surface, border: `1.5px dashed ${C.line22}`, borderRadius: 18 }}>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Nothing here yet</div>
      <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 18 }}>Save recipes from Discover, or create something new.</div>
      <button onClick={onBrowse} style={{ background: C.rust, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '12px 26px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
        Browse recipes
      </button>
    </div>
  );
}
