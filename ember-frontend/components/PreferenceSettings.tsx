'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import type { Profile } from '@/lib/types';
import { C, CUISINES, DIETS, TIMES, SKILLS, GOALS, ALLERGENS, chipStyle } from '@/lib/tokens';
import { Spinner } from './Spinner';

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: C.muted55, marginBottom: 8 };

/**
 * The full personalization panel — cuisines, diet, time, skill, goal,
 * kid-friendly, allergies, pantry, and daily email delivery + time. Profile-
 * bound (persists), so it can appear on both the Daily and Create pages and
 * stays in sync. Used by /daily (sticky) and /create.
 */
export function PreferenceSettings({
  title = 'Recipe preferences',
  subtitle = 'These personalize every recipe TastyEmber creates — here, on Create, and your daily recipe.',
  sticky = false,
  className,
  only,
  bare = false,
}: {
  title?: string;
  subtitle?: string;
  sticky?: boolean;
  className?: string;
  /** Render only these sections (default: all). */
  only?: Array<'cuisines' | 'diet' | 'time' | 'skill' | 'goal' | 'kid' | 'allergies' | 'pantry' | 'email'>;
  /** Render just the section chips with no card/title wrapper (to embed inline). */
  bare?: boolean;
}) {
  const show = (k: NonNullable<typeof only>[number]) => !only || only.includes(k);
  const router = useRouter();
  const { profile, patchProfile } = useApp();
  const [onHand, setOnHand] = useState('');
  const onHandTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (profile) setOnHand(profile.dailyOnHand);
  }, [profile]);
  useEffect(() => {
    if (!profile) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== profile.timezone) void patchProfile({ timezone: tz });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.timezone]);

  if (!profile) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>;
  const p = profile;

  const toggleArr = (key: 'cuisines' | 'diets', v: string) =>
    void patchProfile({ [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] } as Partial<Profile>);
  const toggleAllergen = (a: string) =>
    void patchProfile({ allergens: p.allergens.includes(a) ? p.allergens.filter((x) => x !== a) : [...p.allergens, a] });
  const onHandChange = (v: string) => {
    setOnHand(v);
    clearTimeout(onHandTimer.current);
    onHandTimer.current = setTimeout(() => void patchProfile({ dailyOnHand: v }), 400);
  };
  const toggleEmail = () => (p.email ? void patchProfile({ emailDaily: !p.emailDaily }) : router.push('/profile'));
  const emailLabel = p.emailDaily ? `✓ Emailing daily to ${p.email}` : p.email ? 'Email my daily recipe' : '+ Add your email to enable';

  return (
    <div
      className={bare ? undefined : className}
      style={bare ? undefined : { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '24px 24px 28px', ...(sticky ? { position: 'sticky', top: 84 } : {}) }}
    >
      {!bare && (
        <>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: C.muted55, lineHeight: 1.5, marginBottom: 18 }}>{subtitle}</div>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {show('cuisines') && (
        <div>
          <div style={sectionLabel}>Favourite cuisines</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CUISINES.map((c) => (
              <button key={c} style={chipStyle(p.cuisines.includes(c), C.rust, true)} onClick={() => toggleArr('cuisines', c)}>{c}</button>
            ))}
          </div>
        </div>
        )}
        {show('diet') && (
        <div>
          <div style={sectionLabel}>Dietary</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DIETS.slice(1).map((d) => (
              <button key={d} style={chipStyle(p.diets.includes(d), C.green, true)} onClick={() => toggleArr('diets', d)}>{d}</button>
            ))}
          </div>
        </div>
        )}
        {show('time') && (
        <div>
          <div style={sectionLabel}>Time budget</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIMES.map((t) => (
              <button key={t} style={chipStyle(p.time === t, C.dark, true)} onClick={() => patchProfile({ time: t as Profile['time'] })}>{t}</button>
            ))}
          </div>
        </div>
        )}
        {show('skill') && (
        <div>
          <div style={sectionLabel}>Skill</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SKILLS.map((v) => (
              <button key={v} style={chipStyle(p.skill === v, C.dark, true)} onClick={() => patchProfile({ skill: v as Profile['skill'] })}>{v}</button>
            ))}
          </div>
        </div>
        )}
        {show('goal') && (
        <div>
          <div style={sectionLabel}>Nutrition goal</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GOALS.map((g) => (
              <button key={g} style={chipStyle(p.goal === g, C.goldText, true)} onClick={() => patchProfile({ goal: g as Profile['goal'] })}>{g}</button>
            ))}
          </div>
        </div>
        )}
        {show('kid') && (
        <div>
          <div style={sectionLabel}>Kid-friendly</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={chipStyle(!p.kidFriendly, C.dark, true)} onClick={() => patchProfile({ kidFriendly: false })}>Off</button>
            <button style={chipStyle(p.kidFriendly, C.gold, true)} onClick={() => patchProfile({ kidFriendly: true })}>🧒 On</button>
          </div>
        </div>
        )}
        {show('allergies') && (
        <div>
          <div style={sectionLabel}>Allergies to avoid</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALLERGENS.map((a) => (
              <button key={a} style={chipStyle(p.allergens.includes(a), C.rust, true)} onClick={() => toggleAllergen(a)}>{a}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted55, marginTop: 6 }}>TastyEmber strictly avoids these in every recipe it creates for you.</div>
        </div>
        )}
        {show('pantry') && (
        <div>
          <div style={sectionLabel}>Usually on hand</div>
          <input value={onHand} onChange={(e) => onHandChange(e.target.value)} placeholder="e.g. eggs, rice, frozen peas" style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`, borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 13, background: C.bg, color: C.ink }} />
        </div>
        )}
        {show('email') && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          <div style={sectionLabel}>Daily email delivery</div>
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
            {p.emailDaily ? 'TastyEmber autonomously creates your recipe and emails it at your chosen time.' : 'Turn on to get your autonomously created recipe in your inbox every day.'}
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
        )}
      </div>
    </div>
  );
}
