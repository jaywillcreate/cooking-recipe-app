'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { profileApi, ApiError } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { C, CUISINES, DIETS, SKILLS, TIMES, GOALS, chipStyle } from '@/lib/tokens';
import { ImageUpload } from '@/components/ImageUpload';
import { Spinner } from '@/components/Spinner';

export default function ProfilePage() {
  const router = useRouter();
  const { profile, patchProfile, logout } = useApp();
  const [step, setStep] = useState(1);

  // Password change
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  if (!profile) return <div style={{ display: 'flex', justifyContent: 'center', padding: 120 }}><Spinner /></div>;
  const p = profile;

  const toggleArr = (key: 'cuisines' | 'diets', v: string) => {
    const arr = p[key];
    void patchProfile({ [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] } as Partial<Profile>);
  };

  const label = { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const, color: C.muted55, marginBottom: 10 };
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`, borderRadius: 12, padding: '14px 16px', fontFamily: 'inherit', fontSize: 15, background: C.bg, color: C.ink };

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

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    if (newPw.length < 10) return setPwErr('New password must be at least 10 characters.');
    if (newPw !== confirmPw) return setPwErr('The two new passwords don’t match.');
    setPwBusy(true);
    try {
      await profileApi.changePassword({ currentPassword: p.hasPassword ? curPw : undefined, newPassword: newPw });
      setPwMsg(p.hasPassword ? 'Password updated.' : 'Password set — you can now sign in with email too.');
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      useApp.setState({ profile: { ...p, hasPassword: true } });
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : 'Could not update password. Try again.');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="ember-wrap tight">

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>{p.onboarded ? 'Your taste profile' : 'Set up your taste profile'}</div>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>Ember uses this to personalize search, creations, and your daily recipe.</div>
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

      {/* Password */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '24px 32px', marginTop: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{p.hasPassword ? 'Change password' : 'Set a password'}</div>
        <div style={{ fontSize: 13, color: C.muted55, marginBottom: 18 }}>
          {p.hasPassword ? 'Update the password you use to sign in.' : 'You signed up with Google. Set a password to also sign in with your email.'}
        </div>
        {pwMsg && <div style={{ background: 'rgba(47,122,77,0.12)', color: C.green, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{pwMsg}</div>}
        {pwErr && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{pwErr}</div>}
        <form onSubmit={updatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
          {p.hasPassword && (
            <input type="password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" style={{ ...input, fontSize: 14 }} />
          )}
          <input type="password" placeholder="New password (min 10 characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" style={{ ...input, fontSize: 14 }} />
          <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" style={{ ...input, fontSize: 14 }} />
          <button type="submit" disabled={pwBusy} style={{ alignSelf: 'flex-start', background: C.ink, color: C.bg, fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 999, border: 'none', cursor: pwBusy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {pwBusy && <Spinner size={15} color={C.bg} />}
            {p.hasPassword ? 'Update password' : 'Set password'}
          </button>
        </form>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={() => { void logout(); router.replace('/login'); }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
