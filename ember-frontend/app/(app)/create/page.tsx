'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { generateApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C, SKILLS, TIMES, BAKE_TYPES, BAKE_FLAVORS, chipStyle } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { RecipeRemix } from '@/components/RecipeRemix';
import { CuisineChips } from '@/components/CuisineChips';

function CreateInner() {
  const params = useSearchParams();
  const { profile } = useApp();
  const [craving, setCraving] = useState(params.get('craving') ?? '');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [time, setTime] = useState<(typeof TIMES)[number]>('30 min');
  const [skill, setSkill] = useState<(typeof SKILLS)[number]>('Comfortable');
  const [onHand, setOnHand] = useState('');
  const [kidFriendly, setKidFriendly] = useState(false);
  const [bakeType, setBakeType] = useState(BAKE_TYPES[0]);
  const [bakeFlavor, setBakeFlavor] = useState(BAKE_FLAVORS[0]);
  const isBaking = cuisines.includes('Baking');
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<Recipe[]>([]);
  const [result, setResult] = useState<Recipe | null>(null);
  const [wasRemixed, setWasRemixed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remixNote, setRemixNote] = useState('');
  const [remixing, setRemixing] = useState(false);
  const [remixError, setRemixError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setVariants([]);
    setResult(null);
    setWasRemixed(false);
    setSaved(false);
    setRemixNote('');
    setRemixError(null);
    try {
      const { recipes } = await generateApi.create({
        craving, cuisine: cuisines.length ? cuisines.join(', ') : 'Surprise me', time, skill, onHand, kidFriendly,
        ...(isBaking ? { bakeType, bakeFlavor: bakeFlavor === 'Any' ? undefined : bakeFlavor } : {}),
      });
      setVariants(recipes);
      if (recipes.length === 1) setResult(recipes[0]!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generation hiccuped — give it another try in a moment.');
    } finally {
      setGenerating(false);
    }
  }

  function chooseVariant(v: Recipe) {
    setResult(v);
    setWasRemixed(false);
    setSaved(false);
    setRemixNote('');
    setRemixError(null);
  }

  /** Remix the chosen output: user guidance + this exact recipe → a new variant. */
  async function remix() {
    if (!result || remixing) return;
    const guidance = remixNote.trim();
    if (guidance.length < 2) {
      setRemixError('Tell TastyEmber what to change first — e.g. “make it spicier”.');
      return;
    }
    setRemixing(true);
    setRemixError(null);
    try {
      const recipeText = [
        result.title, result.desc, '',
        'Ingredients:', ...result.ingredients.map((ing) => `- ${ing}`), '',
        'Method:', ...result.steps.map((s, i) => `${i + 1}. ${s}`),
      ].join('\n').slice(0, 6000);
      const { recipe } = await generateApi.edit({ recipeText, instruction: guidance });
      setResult(recipe);
      setWasRemixed(true);
      setSaved(false);
      setRemixNote('');
    } catch (err) {
      setRemixError(err instanceof ApiError ? err.message : 'Remix hiccuped — give it another try in a moment.');
    } finally {
      setRemixing(false);
    }
  }

  async function save() {
    if (!result || saved) return;
    const res = await cookbookApi.save(result.id);
    setSaved(true);
    useApp.getState().setSavedCount(res.count);
  }

  const allergyList = [...(profile?.allergens ?? []), ...(profile?.allergies ? [profile.allergies] : [])].join(', ');
  const profileSummary = [
    profile?.diets.length ? profile.diets.join(', ') : 'no restrictions',
    allergyList ? `avoids ${allergyList}` : null,
    profile && profile.goal !== 'No goal' ? profile.goal.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const inputBase: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid rgba(36,26,18,0.18)`,
    borderRadius: 12,
    fontFamily: 'inherit',
    background: C.bg,
    color: C.ink,
  };
  const label = { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const, color: C.muted55, marginBottom: 10 };

  return (
    <div className="ember-wrap slim create-wrap">

      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ display: 'inline-block', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800, color: '#fff', background: C.green, padding: '6px 14px', borderRadius: 999, marginBottom: 14 }}>
          ✦ AI recipe creation
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>What are you craving?</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>TastyEmber invents a brand-new recipe for you — tuned to your profile.</div>
      </div>

      {!generating && !result && variants.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '28px 30px' }}>
          <textarea
            value={craving}
            onChange={(e) => setCraving(e.target.value)}
            rows={3}
            placeholder="e.g. A cozy noodle soup that feels like a hug, no dairy, some heat…"
            style={{ ...inputBase, padding: '14px 16px', fontSize: 14.5, resize: 'vertical' }}
          />
          <div style={{ marginTop: 22 }}>
            <div style={label}>
              Cuisines <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(pick as many as you like)</span>
            </div>
            <CuisineChips
              selected={cuisines}
              onToggle={(c) => setCuisines((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
              onClear={() => setCuisines([])}
              allLabel="✦ Surprise me"
              activeColor={C.green}
              favorites={profile?.cuisines ?? []}
            />
          </div>

          {isBaking && (
            <div style={{ marginTop: 20, padding: '18px 18px 20px', border: `1px solid ${C.line}`, borderRadius: 14, background: 'rgba(232,161,60,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🧁</span>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Baking studio</div>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted65, marginBottom: 16 }}>
                Tell us what you&apos;re baking and we&apos;ll dial in precise measurements, oven temps and technique.
              </div>
              <div style={label}>What are you baking?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                {BAKE_TYPES.map((t) => (
                  <button key={t} style={chipStyle(bakeType === t, C.rust, true)} onClick={() => setBakeType(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={label}>Flavour direction</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BAKE_FLAVORS.map((f) => (
                  <button key={f} style={chipStyle(bakeFlavor === f, C.gold, true)} onClick={() => setBakeFlavor(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-2col" style={{ marginTop: 22 }}>
            <div>
              <div style={label}>Time</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TIMES.map((t) => (
                  <button key={t} style={chipStyle(time === t, C.dark, true)} onClick={() => setTime(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={label}>Skill level</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SKILLS.map((v) => (
                  <button key={v} style={chipStyle(skill === v, C.dark, true)} onClick={() => setSkill(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 22 }}>
            <div style={label}>
              Ingredients on hand <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </div>
            <input value={onHand} onChange={(e) => setOnHand(e.target.value)} placeholder="e.g. chicken thighs, lemongrass, coconut milk" style={{ ...inputBase, padding: '13px 16px', fontSize: 14 }} />
          </div>
          <div style={{ marginTop: 22 }}>
            <div style={label}>Make it for</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={chipStyle(!kidFriendly, C.dark, true)} onClick={() => setKidFriendly(false)}>Anyone</button>
              <button style={chipStyle(kidFriendly, C.gold, true)} onClick={() => setKidFriendly(true)}>🧒 Kid-friendly</button>
            </div>
          </div>

          {/* Combined into this one section: profile constraints applied to every recipe */}
          <div style={{ marginTop: 26, paddingTop: 22, borderTop: `1px solid ${C.line}` }}>
            <div style={label}>Dietary needs &amp; goals</div>
            <div style={{ fontSize: 12, color: C.muted55, margin: '-4px 0 14px' }}>Saved to your profile and applied as strict constraints to every recipe.</div>
            <PreferenceSettings only={['diet', 'allergies', 'goal']} bare />
          </div>

          <div className="create-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, gap: 14 }}>
            <div style={{ fontSize: 12.5, color: C.muted55 }}>
              Also applies: <span style={{ fontWeight: 700, color: C.green }}>{profileSummary}</span>
            </div>
            <button className="create-cta" onClick={generate} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 15, padding: '15px 34px', borderRadius: 999, border: 'none', cursor: 'pointer', flex: 'none' }}>
              ✦ Create my recipe
            </button>
          </div>
          {error && <div style={{ marginTop: 14, fontSize: 13, color: C.error, fontWeight: 600 }}>{error}</div>}
        </div>
      )}

      {generating && (
        <div style={{ textAlign: 'center', padding: '70px 0' }}>
          <div style={{ margin: '0 auto 18px', width: 'fit-content' }}>
            <Spinner />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Consulting the flavor archives…</div>
          <div style={{ fontSize: 12.5, color: C.muted55, marginTop: 6 }}>Cooking up three takes on your brief…</div>
        </div>
      )}

      {/* variation picker: one brief → 3 distinct takes, choose your favorite */}
      {!generating && !result && variants.length > 1 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Pick your favorite</div>
            <div style={{ fontSize: 13, color: C.muted65, marginTop: 6 }}>Same brief, {variants.length} different directions — choose one to see the full recipe.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {variants.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', flexDirection: 'column', background: C.surface, border: `1.5px solid ${C.line15}`, borderRadius: 16, padding: '20px 20px 18px', borderTop: `4px solid ${v.accent}` }}>
                <div style={{ display: 'inline-block', alignSelf: 'flex-start', fontSize: 10, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: '#fff', background: C.green, padding: '3px 9px', borderRadius: 4, marginBottom: 10 }}>
                  Variation {i + 1} · {v.cuisine}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.2 }}>{v.title}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.muted65, margin: '8px 0 10px', flex: 1 }}>{v.desc}</div>
                <div style={{ fontSize: 11.5, color: C.muted55, fontWeight: 600, marginBottom: 14 }}>{v.meta}</div>
                <button onClick={() => chooseVariant(v)} style={{ background: C.dark, color: C.bg, fontWeight: 700, fontSize: 13, padding: '11px 18px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                  Choose this one →
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={generate} style={{ background: 'none', border: `1.5px solid ${C.line22}`, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', color: C.ink }}>
              ↻ Try another batch
            </button>
            <button onClick={() => setVariants([])} style={{ background: 'none', border: `1.5px solid ${C.line22}`, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', color: C.ink }}>
              ← Edit my brief
            </button>
          </div>
        </div>
      )}

      {result && !generating && (
        <div style={{ background: C.surface, border: `2px solid ${C.green}`, borderRadius: 18, padding: '30px 34px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: '52ch' }}>
              <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#fff', background: C.green, padding: '4px 11px', borderRadius: 4, marginBottom: 12 }}>
                {wasRemixed ? '✎ Remixed' : '✦ New creation'} · {result.cuisine}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>{result.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: C.muted65, marginTop: 10 }}>{result.desc}</div>
              <div style={{ fontSize: 12.5, color: C.muted55, fontWeight: 600, marginTop: 10 }}>{result.meta}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
              <button onClick={save} style={{ background: C.dark, color: C.bg, fontWeight: 700, fontSize: 13.5, padding: '12px 22px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                {saved ? '✓ Saved to cookbook' : '♡ Save to cookbook'}
              </button>
              {variants.length > 1 && (
                <button onClick={() => setResult(null)} style={{ background: 'none', border: `1.5px solid ${C.line22}`, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', color: C.ink }}>
                  ← All variations
                </button>
              )}
              <button onClick={generate} style={{ background: 'none', border: `1.5px solid ${C.line22}`, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', color: C.ink }}>
                ↻ Try another batch
              </button>
            </div>
          </div>

          {/* remix: refine THIS output with the user's guidance → a new variant */}
          <div style={{ marginTop: 24, padding: '16px 18px', background: 'rgba(47,122,77,0.06)', border: `1px solid rgba(47,122,77,0.25)`, borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2 }}>✎ Remix this recipe</div>
            <div style={{ fontSize: 12, color: C.muted65, margin: '3px 0 10px' }}>
              Tell TastyEmber how to refine this exact recipe and it&apos;ll spin up a new variant — your diet &amp; allergy settings still apply.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={remixNote}
                onChange={(e) => { setRemixNote(e.target.value); setRemixError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void remix(); }}
                placeholder="e.g. make it spicier, swap chicken for tofu, ready in 20 minutes…"
                style={{ ...inputBase, flex: 1, minWidth: 220, width: 'auto', padding: '11px 14px', fontSize: 13.5 }}
              />
              <button onClick={remix} disabled={remixing} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 13.5, padding: '11px 22px', borderRadius: 999, border: 'none', cursor: remixing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                {remixing && <Spinner size={14} color="#fff" />}✎ Remix
              </button>
            </div>
            {remixError && <div style={{ marginTop: 8, fontSize: 12.5, color: C.error, fontWeight: 600 }}>{remixError}</div>}
          </div>
          <div className="result-grid" style={{ marginTop: 26 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust, marginBottom: 12 }}>Ingredients</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.ingredients.map((ing, i) => (
                  <div key={i} style={{ fontSize: 13.5, lineHeight: 1.45 }}>· {ing}</div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.rust, marginBottom: 12 }}>Method</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.dark, color: C.bg, fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.55, paddingTop: 2 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <RecipeRemix />

      {/* Mobile-only sticky CTA — always visible while filling out the form */}
      {!generating && !result && variants.length === 0 && (
        <div className="create-sticky-cta">
          <button onClick={generate} style={{ width: '100%', background: C.rust, color: '#fff', fontWeight: 800, fontSize: 16, padding: '15px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            ✦ Create my recipe
          </button>
        </div>
      )}
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>}>
      <CreateInner />
    </Suspense>
  );
}
