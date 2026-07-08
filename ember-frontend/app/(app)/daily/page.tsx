'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dailyApi, cookbookApi } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C, todayLabel, recipeImageUrl } from '@/lib/tokens';
import { Spinner } from '@/components/Spinner';
import { Feedback } from '@/components/Feedback';
import { RecipeRemix } from '@/components/RecipeRemix';
import { PreferenceSettings } from '@/components/PreferenceSettings';

type Daily = (Recipe & { emailedAt?: string | null }) | null;

export default function DailyPage() {
  const router = useRouter();
  const { profile } = useApp();
  const [daily, setDaily] = useState<Daily>(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void dailyApi.today().then(({ daily }) => {
      setDaily(daily);
      setSaved(daily?.saved ?? false);
    });
  }, []);

  if (!profile) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;

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

  return (
    <div className="ember-wrap">
      <div className="daily-grid">
        {/* settings */}
        <PreferenceSettings
          sticky
          className="daily-settings"
          title="Daily recipe settings"
          subtitle="Every day TastyEmber invents one new recipe from these parameters."
        />

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
