'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { generateApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C, CUISINES, SKILLS, TIMES, chipStyle } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { RecipeRemix } from '@/components/RecipeRemix';

function CreateInner() {
  const params = useSearchParams();
  const { profile } = useApp();
  const [craving, setCraving] = useState(params.get('craving') ?? '');
  const [cuisine, setCuisine] = useState('Surprise me');
  const [time, setTime] = useState<(typeof TIMES)[number]>('30 min');
  const [skill, setSkill] = useState<(typeof SKILLS)[number]>('Comfortable');
  const [onHand, setOnHand] = useState('');
  const [kidFriendly, setKidFriendly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Recipe | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const { recipe } = await generateApi.create({ craving, cuisine, time, skill, onHand, kidFriendly });
      setResult(recipe);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generation hiccuped — give it another try in a moment.');
    } finally {
      setGenerating(false);
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
    <div className="ember-wrap slim">

      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ display: 'inline-block', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800, color: '#fff', background: C.green, padding: '6px 14px', borderRadius: 999, marginBottom: 14 }}>
          ✦ AI recipe creation
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>What are you craving?</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>TastyEmber invents a brand-new recipe for you — tuned to your profile.</div>
      </div>

      {!generating && !result && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '28px 30px' }}>
          <textarea
            value={craving}
            onChange={(e) => setCraving(e.target.value)}
            rows={3}
            placeholder="e.g. A cozy noodle soup that feels like a hug, no dairy, some heat…"
            style={{ ...inputBase, padding: '14px 16px', fontSize: 14.5, resize: 'vertical' }}
          />
          <div style={{ marginTop: 22 }}>
            <div style={label}>Cuisine</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Surprise me', ...CUISINES].map((c) => (
                <button key={c} style={chipStyle(cuisine === c, C.green, true)} onClick={() => setCuisine(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
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
          <div style={{ fontSize: 12.5, color: C.muted55, marginTop: 6 }}>Inventing something new from your parameters…</div>
        </div>
      )}

      {result && !generating && (
        <div style={{ background: C.surface, border: `2px solid ${C.green}`, borderRadius: 18, padding: '30px 34px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: '52ch' }}>
              <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#fff', background: C.green, padding: '4px 11px', borderRadius: 4, marginBottom: 12 }}>
                ✦ New creation · {result.cuisine}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>{result.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: C.muted65, marginTop: 10 }}>{result.desc}</div>
              <div style={{ fontSize: 12.5, color: C.muted55, fontWeight: 600, marginTop: 10 }}>{result.meta}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none' }}>
              <button onClick={save} style={{ background: C.dark, color: C.bg, fontWeight: 700, fontSize: 13.5, padding: '12px 22px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                {saved ? '✓ Saved to cookbook' : '♡ Save to cookbook'}
              </button>
              <button onClick={generate} style={{ background: 'none', border: `1.5px solid ${C.line22}`, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', color: C.ink }}>
                ↻ Try another
              </button>
            </div>
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

      {/* Only the always-applied constraints here — cuisine, time, skill and
          kid-friendly are set per-recipe above, so nothing conflicts. */}
      <div style={{ marginTop: 28 }}>
        <PreferenceSettings
          only={['diet', 'allergies', 'goal']}
          title="Dietary needs & goals"
          subtitle="Hard constraints applied to every recipe — saved to your profile and honored strictly."
        />
      </div>
      <RecipeRemix />
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
