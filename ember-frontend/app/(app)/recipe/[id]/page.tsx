'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { recipeApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Collection, Recipe } from '@/lib/types';
import { C, chipStyle, recipeImageUrl, scaleIngredient, BASE_SERVINGS } from '@/lib/tokens';
import { ImageUpload } from '@/components/ImageUpload';
import { Spinner } from '@/components/Spinner';
import { Feedback } from '@/components/Feedback';
import { ShoppingList } from '@/components/ShoppingList';
import { deriveEquipment } from '@/lib/equipment';

const servBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${C.line22}`, background: '#fff',
  color: C.ink, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 0,
};

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [notFound, setNotFound] = useState(false);
  // Email
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [servings, setServings] = useState(BASE_SERVINGS);

  async function sendRecipeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!recipe) return;
    setEmailErr(null);
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await recipeApi.email(recipe.id, { to: emailTo, note: emailNote });
      setEmailMsg(
        res.delivered
          ? `Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.`
          : `Prepared for ${res.sent} — but email delivery isn't turned on for this site yet, so it was logged, not delivered.`,
      );
      setEmailTo('');
      setEmailNote('');
    } catch (err) {
      setEmailErr(err instanceof ApiError ? err.message : 'Could not send. Try again.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function load() {
    try {
      const { recipe } = await recipeApi.get(id);
      setRecipe(recipe);
      setSaved(recipe.saved);
      if (recipe.saved) {
        const { collections } = await cookbookApi.collections();
        setCollections(collections);
      }
    } catch {
      setNotFound(true);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleSave() {
    if (!recipe) return;
    const res = saved ? await cookbookApi.unsave(recipe.id) : await cookbookApi.save(recipe.id);
    setSaved(res.saved);
    useApp.getState().setSavedCount(res.count);
    if (res.saved) {
      const { collections } = await cookbookApi.collections();
      setCollections(collections);
    }
  }

  async function toggleCollection(col: Collection) {
    if (!recipe) return;
    const res = await cookbookApi.toggleCollection(col.id, recipe.id);
    setCollections((cs) =>
      cs.map((c) =>
        c.id === col.id
          ? { ...c, recipeIds: res.inCollection ? [...c.recipeIds, recipe.id] : c.recipeIds.filter((x) => x !== recipe.id) }
          : c,
      ),
    );
  }

  async function addTag() {
    const tag = newTag.trim().toLowerCase().replace(/^#/, '');
    if (!tag || !recipe) return;
    await cookbookApi.addTag(recipe.id, tag);
    setNewTag('');
    setRecipe({ ...recipe, tags: recipe.tags.includes(tag) ? recipe.tags : [...recipe.tags, tag] });
  }

  async function removeTag(tag: string) {
    if (!recipe) return;
    await cookbookApi.removeTag(recipe.id, tag);
    setRecipe({ ...recipe, tags: recipe.tags.filter((t) => t !== tag) });
  }

  if (notFound) {
    return (
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Recipe not found</div>
        <button onClick={() => router.push('/discover')} style={{ background: C.rust, color: '#fff', fontWeight: 700, padding: '12px 26px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
          Browse recipes
        </button>
      </div>
    );
  }
  if (!recipe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}>
        <Spinner />
      </div>
    );
  }

  const n = recipe.nutrition;
  return (
    <div className="ember-wrap narrow">
      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer', padding: '8px 0', marginBottom: 8 }}>
        ← Back
      </button>
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ borderBottom: `4px solid ${recipe.accent}` }}>
          <ImageUpload
            target={{ kind: 'recipe', recipeId: recipe.id }}
            shape="rect"
            height={260}
            currentUrl={recipe.photo}
            fallbackUrl={recipeImageUrl({ ...recipe, photo: null })}
            placeholder="Drop or click to add your dish photo"
            onUploaded={(url) => setRecipe({ ...recipe, photo: url })}
          />
        </div>
        <div className="detail-card-pad" style={{ padding: '32px 36px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: '56ch' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: '#fff', background: recipe.accent, padding: '4px 11px', borderRadius: 4 }}>
                  {recipe.cuisine}
                </span>
                {recipe.tags.map((t) => (
                  <span key={t} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted65, background: 'rgba(36,26,18,0.07)', padding: '4px 11px', borderRadius: 999 }}>
                    {t}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.08 }}>{recipe.title}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: C.muted65, marginTop: 10 }}>{recipe.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
              <button onClick={toggleSave} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', padding: '13px 24px', borderRadius: 999, border: 'none', background: saved ? C.green : C.rust, color: '#fff' }}>
                {saved ? '✓ In your cookbook' : '♡ Save to cookbook'}
              </button>
              <button onClick={() => { setEmailOpen((o) => !o); setEmailMsg(null); setEmailErr(null); }} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '11px 24px', borderRadius: 999, border: `1.5px solid ${C.line22}`, background: 'none', color: C.ink }}>
                ✉ Email recipe
              </button>
              <div style={{ fontSize: 12, color: C.muted55, fontWeight: 500, textAlign: 'center' }}>{recipe.meta}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11.5, color: C.muted55 }}>Rate:</span>
                <Feedback recipeId={recipe.id} initial={recipe.vote} />
              </div>
            </div>
          </div>

          {emailOpen && (
            <form onSubmit={sendRecipeEmail} style={{ marginTop: 16, padding: '16px 18px', background: C.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Email this recipe</div>
              {emailMsg && <div style={{ background: 'rgba(47,122,77,0.12)', color: C.green, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>{emailMsg}</div>}
              {emailErr && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '9px 12px', borderRadius: 8, fontSize: 12.5 }}>{emailErr}</div>}
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="Recipient email(s) — comma-separated, up to 5" style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink }} />
              <input value={emailNote} onChange={(e) => setEmailNote(e.target.value)} placeholder="Add a note (optional)" style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: C.ink }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="submit" disabled={emailBusy} style={{ background: C.rust, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '10px 22px', borderRadius: 999, border: 'none', cursor: emailBusy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {emailBusy && <Spinner size={14} color="#fff" />}Send
                </button>
                <button type="button" onClick={() => { setEmailTo(useApp.getState().user?.email ?? ''); }} style={{ background: 'none', border: 'none', color: C.rust, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                  Email it to me
                </button>
              </div>
            </form>
          )}

          {saved && (
            <div style={{ marginTop: 18, padding: '14px 16px', background: C.bg, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: C.muted, width: 96, flex: 'none' }}>COLLECTIONS</span>
                {collections.map((c) => {
                  const inColl = c.recipeIds.includes(recipe.id);
                  return (
                    <button key={c.id} style={chipStyle(inColl, C.green, true)} onClick={() => toggleCollection(c)}>
                      {c.name}
                      {inColl ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: `1px solid rgba(36,26,18,0.1)`, paddingTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: C.muted, width: 96, flex: 'none' }}>MY TAGS</span>
                {recipe.tags.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#fff', background: C.rust, padding: '6px 8px 6px 13px', borderRadius: 999 }}>
                    #{t}
                    <button onClick={() => removeTag(t)} title="Remove tag" style={{ border: 'none', background: 'rgba(255,255,255,0.25)', color: '#fff', width: 17, height: 17, borderRadius: '50%', fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                      ×
                    </button>
                  </span>
                ))}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void addTag(); }}
                    placeholder="add a tag…"
                    style={{ border: `1.5px solid ${C.line22}`, borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, background: '#fff', color: C.ink, width: 130 }}
                  />
                  <button onClick={addTag} style={{ border: 'none', background: C.dark, color: C.bg, fontWeight: 800, fontSize: 12, padding: '8px 15px', borderRadius: 999, cursor: 'pointer' }}>
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="detail-grid" style={{ marginTop: 32 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust }}>Ingredients</div>
              </div>
              {/* Servings scaler */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', background: C.bg, borderRadius: 999, width: 'fit-content' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted75 }}>Serves</span>
                <button onClick={() => setServings((s) => Math.max(1, s - 1))} style={servBtn} aria-label="Fewer servings">−</button>
                <span style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{servings}</span>
                <button onClick={() => setServings((s) => Math.min(24, s + 1))} style={servBtn} aria-label="More servings">+</button>
                {servings !== BASE_SERVINGS && (
                  <button onClick={() => setServings(BASE_SERVINGS)} style={{ background: 'none', border: 'none', color: C.rust, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginLeft: 2 }}>reset</button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {recipe.ingredients.map((ing, i) => (
                  <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ marginTop: 2, accentColor: C.rust }} />
                    <span>{scaleIngredient(ing, servings / BASE_SERVINGS)}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 24, padding: 16, background: C.bg, borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted55, marginBottom: 10 }}>Per serving</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <div>{n.cal} cal</div>
                  <div>{n.protein}g protein</div>
                  <div>{n.carbs}g carbs</div>
                  <div>{n.fat}g fat</div>
                </div>
              </div>
              <ShoppingList title={recipe.title} items={recipe.ingredients.map((ing) => scaleIngredient(ing, servings / BASE_SERVINGS))} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust, marginBottom: 14 }}>Method</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {recipe.steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.dark, color: C.bg, fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, paddingTop: 3 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cooking items needed */}
          <div style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust }}>Cooking items needed</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.muted55, background: C.bg, borderRadius: 999, padding: '2px 9px' }}>{deriveEquipment(recipe.ingredients, recipe.steps).length}</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted55, marginBottom: 16 }}>Tools and equipment to have ready before you start.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
              {deriveEquipment(recipe.ingredients, recipe.steps).map((eq) => (
                <div key={eq.name} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }} aria-hidden>{eq.emoji}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{eq.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
