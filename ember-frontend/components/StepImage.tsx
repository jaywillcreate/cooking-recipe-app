'use client';
import { useState, type CSSProperties } from 'react';
import { C, stepImageUrl, STEP_IMAGE_ISSUES } from '@/lib/tokens';
import { useGeneratedImage } from '@/lib/useGeneratedImage';
import { imagesApi } from '@/lib/api';

const shimmerBg = `linear-gradient(100deg, ${C.bg} 30%, rgba(196,85,45,0.08) 50%, ${C.bg} 70%)`;

const voteBtn = (active: boolean, color: string): CSSProperties => ({
  fontFamily: 'inherit', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: '4px 8px',
  borderRadius: 8, border: `1.5px solid ${active ? color : C.line22}`,
  background: active ? color : 'transparent', filter: active ? 'none' : 'grayscale(0.3)',
});
const chipStyle = (active: boolean): CSSProperties => ({
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 11px',
  borderRadius: 999, border: `1.5px solid ${active ? 'transparent' : C.line22}`,
  background: active ? C.rust : 'transparent', color: active ? '#fff' : C.muted75, lineHeight: 1,
});

/**
 * A generated instructional image for one method step, with a feedback bar.
 * 👍/👎 are stored; 👎 opens an issue panel whose corrections are sent back to
 * the model to regenerate an improved image (persisted so the fix sticks).
 */
export function StepImage({ recipeId, cuisine, index, text, title, anchorReady = true }: {
  recipeId: string; cuisine: string; index: number; text: string; title?: string; anchorReady?: boolean;
}) {
  const fallback = stepImageUrl(recipeId, cuisine, index, text, title);
  const { url: hookUrl, ready } = useGeneratedImage(recipeId, fallback, { stepIndex: index, enabled: anchorReady });

  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [vote, setVote] = useState<1 | -1 | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (failed) return null;

  const url = manualUrl ?? hookUrl;
  const showSkeleton = !ready || !loaded || regenerating;
  const canSubmit = tags.length > 0 || note.trim().length > 0;
  const toggleTag = (k: string) => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  async function thumbUp() {
    setVote(1); setPanelOpen(false); setMsg('Thanks — glad it looks right ✓');
    try { await imagesApi.feedback(recipeId, index, 1); } catch { /* non-critical */ }
  }

  async function sendOnly() {
    setBusy(true);
    try {
      await imagesApi.feedback(recipeId, index, -1, tags, note.trim() || undefined);
      setMsg('Feedback saved — thank you ✓'); setPanelOpen(false); setTags([]); setNote('');
    } catch { setMsg('Could not save — try again.'); } finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true); setMsg(null);
    try {
      const res = await imagesApi.regenerateStep(recipeId, index, { tags, note: note.trim() || undefined });
      if (res?.url) { setRegenerating(true); setLoaded(false); setManualUrl(res.url); }
      setPanelOpen(false);
      setMsg(res?.capped ? 'Reached the improvement limit for this image.' : 'Improved with your feedback ✓');
      setTags([]); setNote('');
    } catch { setMsg('Could not regenerate — try again.'); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, maxWidth: 420 }}>
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio: '512 / 340', borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${C.line}`, background: showSkeleton ? shimmerBg : 'transparent',
          backgroundSize: '200% 100%', animation: showSkeleton ? 'emberShimmer 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {showSkeleton && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.muted55 }}>
            ✦ {regenerating ? 'improving image…' : `generating step ${index + 1}…`}
          </div>
        )}
        {ready && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`Step ${index + 1} illustration`}
            loading="lazy"
            onLoad={() => { setLoaded(true); setRegenerating(false); }}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded && !regenerating ? 1 : 0, transition: 'opacity .35s ease' }}
          />
        )}
      </div>

      {ready && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted65, flexWrap: 'wrap' }}>
            <span>Does this match the step?</span>
            <button type="button" onClick={thumbUp} aria-label="Looks right" title="Looks right" style={voteBtn(vote === 1, C.green)}>👍</button>
            <button type="button" onClick={() => { setVote(-1); setPanelOpen(true); setMsg(null); }} aria-label="Report a problem" title="Something's off" style={voteBtn(vote === -1, C.rust)}>👎</button>
            {msg && <span style={{ color: C.green, fontWeight: 700 }}>{msg}</span>}
          </div>

          {panelOpen && (
            <div style={{ marginTop: 8, padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted75, marginBottom: 8 }}>What&apos;s wrong? (pick any that apply)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {STEP_IMAGE_ISSUES.map((iss) => (
                  <button key={iss.key} type="button" onClick={() => toggleTag(iss.key)} style={chipStyle(tags.includes(iss.key))}>{iss.label}</button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional) — e.g. “the pot should be on the stove”"
                rows={2}
                maxLength={500}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 10px', border: `1px solid ${C.line22}`, borderRadius: 8, resize: 'vertical', color: C.ink, background: C.bg }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={busy || !canSubmit}
                  style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: busy || !canSubmit ? 'default' : 'pointer', padding: '8px 14px', borderRadius: 999, border: 'none', background: busy || !canSubmit ? C.line22 : C.rust, color: '#fff', opacity: busy || !canSubmit ? 0.7 : 1 }}
                >
                  {busy ? 'Working…' : '✦ Regenerate with my feedback'}
                </button>
                <button type="button" onClick={sendOnly} disabled={busy || !canSubmit} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: busy || !canSubmit ? 'default' : 'pointer', border: 'none', background: 'transparent', color: C.muted75, textDecoration: 'underline' }}>
                  Just send feedback
                </button>
                <button type="button" onClick={() => setPanelOpen(false)} style={{ fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: C.muted55, marginLeft: 'auto' }}>
                  Cancel
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: C.muted55, marginTop: 8 }}>Your feedback is stored and used to improve the visual guide.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
