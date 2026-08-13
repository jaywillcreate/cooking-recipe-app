'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { profileApi, calendarApi, nutritionApi, mealPlanApi, ApiError } from '@/lib/api';
import type { CalendarStatus, Profile } from '@/lib/types';
import { C, mono, CUISINES, DIETS, SKILLS, TIMES, GOALS, chipStyle } from '@/lib/tokens';
import { ImageUpload } from '@/components/ImageUpload';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { NutritionTracker, toYMD, addDays } from '@/components/NutritionTracker';
import { MealPlanCalendar, weekStart } from '@/components/MealPlanCalendar';
import { Spinner } from '@/components/Spinner';

type Section = 'account' | 'preferences' | 'nutrition' | 'mealplan' | 'connections';

const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  { id: 'account', label: 'Account', blurb: 'Your photo, name, and sign-in details.' },
  { id: 'preferences', label: 'Taste & cooking', blurb: 'What TastyEmber uses to personalize every recipe.' },
  { id: 'nutrition', label: 'Nutrition', blurb: 'Track what you eat against your daily targets.' },
  { id: 'mealplan', label: 'Meal plan', blurb: 'Plan the week, then send meals to your calendar.' },
  { id: 'connections', label: 'Connections', blurb: 'Link outside services like Google Calendar.' },
];

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`, borderRadius: 12,
  padding: '13px 15px', fontFamily: 'inherit', fontSize: 14.5, background: C.bg, color: C.ink,
};
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted55, marginBottom: 8 };
const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '26px 28px' };

export default function ProfilePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>}>
      <ProfileInner />
    </Suspense>
  );
}

function ProfileInner() {
  const { profile } = useApp();
  if (!profile) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;
  return profile.onboarded ? <Dashboard /> : <OnboardingWizard />;
}

// ─── Settings dashboard (after onboarding) ──────────────────────────────────

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile, patchProfile, logout, savedCount, refreshSavedCount } = useApp();
  const p = profile!;

  // Hero stats — today's intake, this week's plan, cookbook size.
  const [todayTotals, setTodayTotals] = useState<{ cal: number; protein: number } | null>(null);
  const [plannedCount, setPlannedCount] = useState<number | null>(null);
  useEffect(() => {
    nutritionApi
      .day(toYMD(new Date()))
      .then((r) => setTodayTotals({ cal: r.totals.cal, protein: r.totals.protein }))
      .catch(() => {});
    const ws = weekStart(new Date());
    mealPlanApi
      .range(toYMD(ws), toYMD(addDays(ws, 6)))
      .then((r) => setPlannedCount(r.entries.length))
      .catch(() => {});
    void refreshSavedCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialSection = ((): Section => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (SECTIONS.some((s) => s.id === hash)) return hash as Section;
    }
    return 'account';
  })();
  const [section, setSection] = useState<Section>(initialSection);
  const active = SECTIONS.find((s) => s.id === section)!;

  const go = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, '', `#${s}`);
  };

  // name edits: optimistic locally, persisted debounced
  const [name, setName] = useState(p.name);
  const nameTimer = useRef<ReturnType<typeof setTimeout>>();
  const onName = (v: string) => {
    setName(v);
    clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => void patchProfile({ name: v }), 400);
  };

  // Google Calendar connection
  const [cal, setCal] = useState<CalendarStatus | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const calResult = params.get('calendar'); // callback redirect lands with ?calendar=connected|error
  const calReason = params.get('reason');
  const [calNotice, setCalNotice] = useState<{ ok: boolean; msg: string } | null>(
    calResult === 'connected'
      ? { ok: true, msg: 'Google Calendar connected — your planned meals can now land on your schedule.' }
      : calResult === 'error'
        ? { ok: false, msg: calReason || 'Google Calendar connection failed. Please try again.' }
        : null,
  );
  useEffect(() => {
    calendarApi.status().then(setCal).catch(() => {});
  }, []);

  async function connectCalendar() {
    setCalBusy(true);
    try {
      const { url } = await calendarApi.startConnect();
      window.location.href = url;
    } catch (err) {
      setCalNotice({ ok: false, msg: err instanceof ApiError ? err.message : 'Could not start the Google connection.' });
      setCalBusy(false);
    }
  }

  async function disconnectCalendar() {
    setCalBusy(true);
    try {
      await calendarApi.disconnect();
      setCal((c) => (c ? { ...c, connected: false, email: null, connectedAt: null } : c));
      setCalNotice(null);
    } finally {
      setCalBusy(false);
    }
  }

  const firstName = p.name.trim().split(/\s+/)[0] || 'there';
  const calPct = p.targetCalories > 0 && todayTotals ? Math.round((todayTotals.cal / p.targetCalories) * 100) : 0;
  const cheer =
    !todayTotals || todayTotals.cal === 0
      ? 'A fresh day — log your first meal to get the bars moving.'
      : calPct <= 55
        ? `${calPct}% of today’s calorie target — plenty of room left. 🍳`
        : calPct <= 105
          ? `${calPct}% of today’s calorie target — right on track, keep it up! 🔥`
          : `${calPct}% of today’s calorie target — a lighter plate tomorrow evens it out.`;

  const heroTiles: { label: string; big: string; unit: string; sub: string; tint: string; pct?: number; barColor?: string }[] = [
    {
      label: 'Calories today', big: String(todayTotals?.cal ?? '–'), unit: 'kcal', sub: `of ${p.targetCalories} target`,
      tint: 'rgba(196,85,45,0.09)', pct: todayTotals ? Math.min(100, calPct) : 0, barColor: C.rust,
    },
    {
      label: 'Protein today', big: String(todayTotals?.protein ?? '–'), unit: 'g', sub: `of ${p.targetProtein} g target`,
      tint: 'rgba(47,122,77,0.10)', pct: todayTotals && p.targetProtein > 0 ? Math.min(100, Math.round((todayTotals.protein / p.targetProtein) * 100)) : 0, barColor: C.green,
    },
    {
      label: 'Planned this week', big: String(plannedCount ?? '–'), unit: plannedCount === 1 ? 'meal' : 'meals',
      sub: 'on your meal plan', tint: 'rgba(232,161,60,0.14)',
    },
    {
      label: 'Cookbook', big: String(savedCount), unit: savedCount === 1 ? 'recipe' : 'recipes',
      sub: 'saved to your shelf', tint: 'rgba(36,26,18,0.05)',
    },
  ];

  return (
    <div className="ember-wrap narrow">
      {/* hero — greeting + live stat tiles */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, padding: '26px 28px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, flex: 'none', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${C.line15}`, background: C.bg }}>
            <ImageUpload
              target={{ kind: 'avatar' }}
              shape="circle"
              height={72}
              currentUrl={p.avatarUrl}
              placeholder="+"
              onUploaded={(url) => useApp.setState({ profile: { ...p, avatarUrl: url } })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>
              Hello, {firstName} <span aria-hidden>👋</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 11.5, color: C.muted65, marginTop: 5 }}>{p.email}</div>
          </div>
          <button onClick={() => { void logout(); router.replace('/login'); }} style={{ background: 'none', border: `1.5px solid ${C.line22}`, borderRadius: 999, color: C.muted75, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '9px 18px', flex: 'none' }}>
          Sign out
          </button>
        </div>

        <div className="macro-grid" style={{ marginTop: 20 }}>
          {heroTiles.map((t) => (
            <div key={t.label} style={{ background: t.tint, borderRadius: 18, padding: '15px 16px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1 }}>{t.big}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.muted65 }}>{t.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted55, marginTop: 4 }}>{t.sub}</div>
              {t.pct !== undefined && (
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(36,26,18,0.09)', overflow: 'hidden', marginTop: 9 }}>
                  <div style={{ height: '100%', width: `${t.pct}%`, borderRadius: 99, background: t.barColor, transition: 'width 0.3s ease' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, color: C.muted65, marginTop: 14, lineHeight: 1.5 }}>{cheer}</div>
      </div>

      <div className="profile-grid">
        {/* section nav */}
        <nav className="profile-nav" aria-label="Profile settings sections">
          {SECTIONS.map((s) => {
            const isActive = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                aria-current={isActive}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', fontFamily: 'inherit',
                  fontSize: 13.5, fontWeight: isActive ? 800 : 600, cursor: 'pointer', padding: '11px 16px', borderRadius: 12,
                  border: 'none', background: isActive ? C.ink : 'transparent', color: isActive ? C.bg : C.muted75,
                }}
              >
                {s.label}
                {s.id === 'connections' && cal?.connected && <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: C.green, flex: 'none' }} />}
              </button>
            );
          })}
        </nav>

        {/* section content */}
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{active.label}</div>
            <div style={{ fontSize: 13, color: C.muted55, marginTop: 3 }}>{active.blurb}</div>
          </div>

          {section === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={label}>Profile photo</div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 22 }}>
                  <div style={{ width: 92, height: 92, flex: 'none', borderRadius: '50%', background: C.bg, border: `1.5px dashed rgba(36,26,18,0.3)`, overflow: 'hidden' }}>
                    <ImageUpload
                      target={{ kind: 'avatar' }}
                      shape="circle"
                      height={92}
                      currentUrl={p.avatarUrl}
                      placeholder="Add photo"
                      onUploaded={(url) => useApp.setState({ profile: { ...p, avatarUrl: url } })}
                    />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted65, lineHeight: 1.55 }}>
                    Tap the circle to upload a new photo (JPEG, PNG, or WebP up to 6 MB).
                    {p.avatarUrl && (
                      <div>
                        <button
                          onClick={async () => {
                            await profileApi.setAvatar(null);
                            useApp.setState({ profile: { ...p, avatarUrl: null } });
                          }}
                          style={{ marginTop: 8, background: 'none', border: 'none', color: C.error, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          Remove photo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={label}>Name</div>
                <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Your name" style={{ ...input, marginBottom: 18 }} />
                <div style={label}>Email</div>
                <input value={p.email} readOnly title="Your account email — daily recipes are delivered here" style={{ ...input, fontSize: 13.5, color: C.muted65, cursor: 'not-allowed' }} />
              </div>
              <div style={card}>
                <PasswordCard />
              </div>
              <div style={card}>
                <PreferenceSettings bare only={['email']} />
              </div>
            </div>
          )}

          {section === 'preferences' && (
            <div style={card}>
              <PreferenceSettings bare only={['cuisines', 'baking', 'diet', 'time', 'skill', 'goal', 'kid', 'allergies', 'pantry']} />
            </div>
          )}

          {section === 'nutrition' && (
            <div style={card}>
              <NutritionTracker />
            </div>
          )}

          {section === 'mealplan' && (
            <div style={card}>
              <MealPlanCalendar calendarConnected={!!cal?.connected} onNeedCalendar={() => go('connections')} />
            </div>
          )}

          {section === 'connections' && (
            <div style={card}>
              {calNotice && (
                <div style={{ background: calNotice.ok ? 'rgba(47,122,77,0.12)' : 'rgba(196,85,45,0.1)', color: calNotice.ok ? C.green : '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                  {calNotice.msg}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: C.bg, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  📆
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800 }}>Google Calendar</div>
                  <div style={{ fontSize: 12.5, color: C.muted65, lineHeight: 1.55, marginTop: 3 }}>
                    Send planned meals from your meal plan straight onto your Google Calendar — each lands as a 1-hour event at that meal's usual time.
                  </div>
                  {cal?.connected && (
                    <div style={{ fontFamily: mono, fontSize: 11.5, color: C.green, marginTop: 8 }}>
                      ✓ connected{cal.email ? ` as ${cal.email}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ flex: 'none' }}>
                  {!cal ? (
                    <Spinner size={18} />
                  ) : !cal.configured ? (
                    <span style={{ fontSize: 12, color: C.muted55 }}>Not available on this deployment</span>
                  ) : cal.connected ? (
                    <button onClick={() => void disconnectCalendar()} disabled={calBusy} style={{ background: 'none', border: `1.5px solid ${C.line22}`, borderRadius: 999, color: C.muted75, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '9px 18px' }}>
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={() => void connectCalendar()} disabled={calBusy} style={{ background: C.rust, border: 'none', borderRadius: 999, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '10px 20px' }}>
                      {calBusy ? 'Opening…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted55, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, lineHeight: 1.55 }}>
                TastyEmber only asks for permission to create events — it never reads your existing calendar. Disconnect any time; that revokes our access with Google too.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Password (shared by dashboard Account section) ─────────────────────────

function PasswordCard() {
  const { profile } = useApp();
  const p = profile!;
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (newPw.length < 10) return setErr('New password must be at least 10 characters.');
    if (newPw !== confirmPw) return setErr('The two new passwords don’t match.');
    setBusy(true);
    try {
      await profileApi.changePassword({ currentPassword: p.hasPassword ? curPw : undefined, newPassword: newPw });
      setMsg(p.hasPassword ? 'Password updated.' : 'Password set — you can now sign in with email too.');
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      useApp.setState({ profile: { ...p, hasPassword: true } });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not update password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>{p.hasPassword ? 'Change password' : 'Set a password'}</div>
      <div style={{ fontSize: 12.5, color: C.muted55, marginBottom: 16 }}>
        {p.hasPassword ? 'Update the password you use to sign in.' : 'You signed up with Google. Set a password to also sign in with your email.'}
      </div>
      {msg && <div style={{ background: 'rgba(47,122,77,0.12)', color: C.green, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}
      {err && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <form onSubmit={updatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
        {p.hasPassword && (
          <input type="password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" style={{ ...input, fontSize: 14 }} />
        )}
        <input type="password" placeholder="New password (min 10 characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" style={{ ...input, fontSize: 14 }} />
        <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" style={{ ...input, fontSize: 14 }} />
        <button type="submit" disabled={busy} style={{ alignSelf: 'flex-start', background: C.ink, color: C.bg, fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {busy && <Spinner size={15} color={C.bg} />}
          {p.hasPassword ? 'Update password' : 'Set password'}
        </button>
      </form>
    </>
  );
}

// ─── First-run onboarding wizard (unchanged 4-step flow) ────────────────────

function OnboardingWizard() {
  const router = useRouter();
  const { profile, patchProfile } = useApp();
  const [step, setStep] = useState(1);
  const p = profile!;

  const toggleArr = (key: 'cuisines' | 'diets', v: string) => {
    const arr = p[key];
    void patchProfile({ [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<Profile>);
  };

  const review =
    `${p.name || 'You'}${p.email ? ' · ' + p.email : ''} · loves ${p.cuisines.join(', ') || 'everything'} · ` +
    `${p.diets.length ? p.diets.join(', ') : 'no restrictions'}${p.allergies ? ' · avoids ' + p.allergies : ''} · ` +
    `${p.skill} cook · ${p.time} weeknights · ${p.goal}`;

  function next() {
    if (step < 4) setStep(step + 1);
    else {
      void patchProfile({ onboarded: true });
      router.push('/discover');
    }
  }

  return (
    <div className="ember-wrap tight">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>Set up your taste profile</div>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>TastyEmber uses this to personalize search, creations, and your daily recipe.</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 26 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 5, flex: 1, borderRadius: 99, background: i <= step ? C.rust : 'rgba(36,26,18,0.15)' }} />
        ))}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '30px 32px' }}>
        {step === 1 && (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Hi there — what should we call you?</div>
            <div style={{ fontSize: 13, color: C.muted55, marginBottom: 18 }}>Step 1 of 4 · Basics</div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
              <div style={{ width: 92, height: 92, flex: 'none', borderRadius: '50%', background: C.bg, border: `1.5px dashed rgba(36,26,18,0.3)`, overflow: 'hidden' }}>
                <ImageUpload
                  target={{ kind: 'avatar' }}
                  shape="circle"
                  height={92}
                  currentUrl={p.avatarUrl}
                  placeholder="Add photo"
                  onUploaded={(url) => useApp.setState({ profile: { ...p, avatarUrl: url } })}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <input value={p.name} onChange={(e) => patchProfile({ name: e.target.value })} placeholder="Your name" style={input} />
                <input value={p.email} readOnly title="Your account email — daily recipes are delivered here" style={{ ...input, fontSize: 14, color: C.muted65, cursor: 'not-allowed' }} />
              </div>
            </div>
            <div style={label}>Cuisines you love</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CUISINES.map((c) => (
                <button key={c} style={chipStyle(p.cuisines.includes(c), C.rust, true)} onClick={() => toggleArr('cuisines', c)}>{c}</button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Any dietary needs?</div>
            <div style={{ fontSize: 13, color: C.muted55, marginBottom: 18 }}>Step 2 of 4 · Diet &amp; allergies</div>
            <div style={label}>Diet</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {DIETS.map((d) => {
                const active = d === 'None' ? p.diets.length === 0 : p.diets.includes(d);
                return (
                  <button key={d} style={chipStyle(active, C.green, true)} onClick={() => (d === 'None' ? patchProfile({ diets: [] }) : toggleArr('diets', d))}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div style={label}>Allergies to avoid</div>
            <input value={p.allergies} onChange={(e) => patchProfile({ allergies: e.target.value })} placeholder="e.g. peanuts, shellfish" style={{ ...input, fontSize: 14 }} />
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>How do you like to cook?</div>
            <div style={{ fontSize: 13, color: C.muted55, marginBottom: 18 }}>Step 3 of 4 · Skill &amp; time</div>
            <div style={label}>Skill level</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {SKILLS.map((v) => (
                <button key={v} style={chipStyle(p.skill === v, C.dark, true)} onClick={() => patchProfile({ skill: v as Profile['skill'] })}>{v}</button>
              ))}
            </div>
            <div style={label}>Weeknight time budget</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIMES.map((t) => (
                <button key={t} style={chipStyle(p.time === t, C.dark, true)} onClick={() => patchProfile({ time: t as Profile['time'] })}>{t}</button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Any nutrition goals?</div>
            <div style={{ fontSize: 13, color: C.muted55, marginBottom: 18 }}>Step 4 of 4 · Goals</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
              {GOALS.map((g) => (
                <button key={g} style={chipStyle(p.goal === g, C.goldText, true)} onClick={() => patchProfile({ goal: g as Profile['goal'] })}>{g}</button>
              ))}
            </div>
            <div style={{ padding: '16px 18px', background: C.bg, borderRadius: 12, fontSize: 13, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 800 }}>Your profile:</span> {review}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: '12px 22px', borderRadius: 999, border: `1.5px solid ${C.line22}`, background: 'none', color: C.muted75, visibility: step === 1 ? 'hidden' : 'visible' }}
          >
            ← Back
          </button>
          <button onClick={next} style={{ background: C.rust, color: '#fff', fontWeight: 800, fontSize: 14, padding: '13px 30px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            {step === 4 ? '✓ Finish setup' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}
