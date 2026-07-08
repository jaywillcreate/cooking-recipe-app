'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dailyApi, cookbookApi } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Profile, Recipe } from '@/lib/types';
import { C, CUISINES, DIETS, TIMES, SKILLS, GOALS, ALLERGENS, chipStyle, todayLabel, recipeImageUrl } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { Feedback } from '@/components/Feedback';
import { RecipeRemix } from '@/components/RecipeRemix';

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

type Daily = (Recipe & { emailedAt?: string | null }) | null;

export default function DailyPage() {
  const router = useRouter();
  const { profile, patchProfile } = useApp();
  const [daily, setDaily] = useState<Daily>(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [onHand, setOnHand] = useState('');
  const onHandTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    void dailyApi.today().then(({ daily }) => {
      setDaily(daily);
      setSaved(daily?.saved ?? false);
    });
  }, []);
  useEffect(() => {
    if (profile) setOnHand(profile.dailyOnHand);
  }, [profile]);
  // Capture the browser's timezone so the daily delivery time is accurate.
  useEffect(() => {
    if (!profile) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== profile.timezone) void patchProfile({ timezone: tz });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.timezone]);

  if (!profile) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;
  const p = profile;

  const toggleArr = (key: 'cuisines' | 'diets', v: string) => {
    const arr = p[key];
    void patchProfile({ [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<Profile>);
  };
  const toggleAllergen = (a: string) => {
    void patchProfile({ allergens: p.allergens.includes(a) ? p.allergens.filter((x) => x !== a) : [...p.allergens, a] });
  };

  async function generateDaily() {
    setGenerating(true);
    try {
      const { recipe } = await dailyApi.generate(!!daily); // force-regenerate if one exists
      setDaily(recipe);
      setSaved(recipe.saved ?? false);
    } finally {
      setGenerating(false);
    }
  }

  async function toggleSaveDaily() {
    if (!daily) return;
    const res = saved ? await cookbookApi.unsave(daily.id) : await cookbookApi.save(daily.id);
    setSaved(res.saved);
    useApp.getState().setSavedCount(res.count);
  }

  function onHandChange(v: string) {
    setOnHand(v);
    clearTimeout(onHandTimer.current);
    onHandTimer.current = setTimeout(() => void patchProfile({ dailyOnHand: v }), 400);
  }

  function toggleEmail() {
    if (p.email) void patchProfile({ emailDaily: !p.emailDaily });
    else router.push('/profile');
  }

  const sectionLabel = { fontSize: 11, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase' as const, color: C.muted55, marginBottom: 8 };
  const emailLabel = p.emailDaily ? `✓ Emailing daily to ${p.email}` : p.email ? 'Email my daily recipe' : '+ Add your email to enable';

  return (
    <div className="ember-wrap">
      <div className="daily-grid">
        {/* settings */}
        <div className="daily-settings" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '24px 24px 28px', position: 'sticky', top: 84 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, marginBottom: 4 }}>Daily recipe settings</div>
          <div style={{ fontSize: 12.5, color: C.muted55, lineHeight: 1.5, marginBottom: 18 }}>Every day Ember invents one new recipe from these parameters.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={sectionLabel}>Cuisines</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CUISINES.slice(0, 8).map((c) => (
                  <button key={c} style={chipStyle(p.cuisines.includes(c), C.rust, true)} onClick={() => toggleArr('cuisines', c)}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Dietary</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIETS.slice(1).map((d) => (
                  <button key={d} style={chipStyle(p.diets.includes(d), C.green, true)} onClick={() => toggleArr('diets', d)}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Time budget</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TIMES.map((t) => (
                  <button key={t} style={chipStyle(p.time === t, C.dark, true)} onClick={() => patchProfile({ time: t as Profile['time'] })}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Skill</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SKILLS.map((v) => (
                  <button key={v} style={chipStyle(p.skill === v, C.dark, true)} onClick={() => patchProfile({ skill: v as Profile['skill'] })}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Nutrition goal</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {GOALS.map((g) => (
                  <button key={g} style={chipStyle(p.goal === g, C.goldText, true)} onClick={() => patchProfile({ goal: g as Profile['goal'] })}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Kid-friendly</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={chipStyle(!p.kidFriendly, C.dark, true)} onClick={() => patchProfile({ kidFriendly: false })}>Off</button>
                <button style={chipStyle(p.kidFriendly, C.gold, true)} onClick={() => patchProfile({ kidFriendly: true })}>🧒 On</button>
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Allergies to avoid</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ALLERGENS.map((a) => (
                  <button key={a} style={chipStyle(p.allergens.includes(a), C.rust, true)} onClick={() => toggleAllergen(a)}>{a}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.muted55, marginTop: 6 }}>Ember strictly avoids these in every recipe it creates for you.</div>
            </div>
            <div>
              <div style={sectionLabel}>Usually on hand</div>
              <input value={onHand} onChange={(e) => onHandChange(e.target.value)} placeholder="e.g. eggs, rice, frozen peas" style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`, borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 13, background: C.bg, color: C.ink }} />
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={sectionLabel}>Email delivery</div>
              <button
                onClick={toggleEmail}
                style={{
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '9px 16px', borderRadius: 999, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                  border: p.emailDaily ? '1.5px solid transparent' : `1.5px solid ${C.line22}`,
                  background: p.emailDaily ? C.green : 'transparent',
                  color: p.emailDaily ? '#fff' : C.muted75,
                }}
              >
                {emailLabel}
              </button>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted55, marginTop: 8 }}>
                {p.emailDaily ? 'Ember autonomously creates your recipe and emails it at your chosen time.' : 'Turn on to get your autonomously created recipe in your inbox every day.'}
              </div>
              {p.emailDaily && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted75 }}>Deliver at</span>
                  <select
                    value={p.deliveryHour}
                    onChange={(e) => patchProfile({ deliveryHour: parseInt(e.target.value, 10) })}
                    style={{ fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 10, border: `1.5px solid ${C.line22}`, background: C.bg, color: C.ink, cursor: 'pointer' }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: C.muted55 }}>your local time</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* today's card */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7 }}>Today · {todayLabel()}</div>
            <button onClick={generateDaily} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13.5, padding: '12px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              {daily ? "↻ Regenerate today's" : "✦ Generate today's recipe"}
            </button>
          </div>

          {generating && (
            <div style={{ textAlign: 'center', padding: '80px 0', background: C.surface, borderRadius: 18, border: `1px solid ${C.line}` }}>
              <div style={{ margin: '0 auto 18px', width: 'fit-content' }}><Spinner /></div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Cooking up today&apos;s recipe…</div>
            </div>
          )}

          {daily && !generating && (
            <div style={{ background: C.dark, color: C.bg, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ height: 190, background: `#2b2018 url("${recipeImageUrl(daily)}") center/cover no-repeat` }} />
              <div style={{ padding: '28px 32px 32px' }}>
                <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: C.dark, background: C.gold, padding: '4px 11px', borderRadius: 4, marginBottom: 12 }}>
                  {daily.cuisine} · {daily.meta}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>{daily.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(250,245,236,0.7)', marginTop: 10, maxWidth: '58ch' }}>{daily.desc}</div>
                <div style={{ display: 'flex', gap: 11, marginTop: 20, flexWrap: 'wrap' }}>
                  <button onClick={() => router.push(`/recipe/${daily.id}`)} style={{ background: C.gold, color: C.dark, fontWeight: 800, fontSize: 13.5, padding: '12px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                    View full recipe →
                  </button>
                  <button onClick={toggleSaveDaily} style={{ background: 'none', border: '1.5px solid rgba(250,245,236,0.4)', color: C.bg, fontWeight: 600, fontSize: 13, padding: '11px 22px', borderRadius: 999, cursor: 'pointer' }}>
                    {saved ? '✓ Saved' : '♡ Save'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                    <Feedback recipeId={daily.id} initial={daily.vote} dark />
                  </div>
                </div>
              </div>
            </div>
          )}

          {!daily && !generating && (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>No recipe yet today</div>
              <div style={{ fontSize: 13.5, color: C.muted }}>Set your parameters on the left, then generate today&apos;s personal recipe.</div>
            </div>
          )}

          <div style={{ marginTop: 22, padding: '16px 20px', background: 'rgba(232,161,60,0.12)', borderRadius: 12, fontSize: 12.5, lineHeight: 1.55, color: C.muted75 }}>
            <span style={{ fontWeight: 800, color: C.goldText }}>How it works:</span> a new recipe is generated automatically each day from your parameters and emailed to you at your chosen time when delivery is on. You can also generate or regenerate today&apos;s here anytime.
          </div>

          <RecipeRemix />
        </div>
      </div>
    </div>
  );
}
