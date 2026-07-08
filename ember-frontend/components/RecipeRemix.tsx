'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateApi, cookbookApi, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Recipe } from '@/lib/types';
import { C } from '@/lib/tokens';
import { Spinner } from './Spinner';

/**
 * Upload/paste an existing recipe + an instruction ("make it vegan",
 * "for 2 people", "less spicy") → AI returns a revised version.
 */
export function RecipeRemix() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [recipeText, setRecipeText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Recipe | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadFile(f: File) {
    if (f.size > 200_000) {
      setError('That file is too large — paste the recipe text instead.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRecipeText(String(reader.result || '').slice(0, 6000));
    reader.readAsText(f);
  }

  async function remix() {
    setError(null);
    if (recipeText.trim().length < 10) return setError('Paste or upload a recipe first.');
    if (instruction.trim().length < 2) return setError('Describe the change you want.');
    setBusy(true);
    setResult(null);
    setSaved(false);
    try {
      const { recipe } = await generateApi.edit({ recipeText, instruction });
      setResult(recipe);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revise that recipe. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result || saved) return;
    const res = await cookbookApi.save(result.id);
    setSaved(true);
    useApp.getState().setSavedCount(res.count);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `1.5px solid rgba(36,26,18,0.18)`, borderRadius: 12,
    padding: '12px 14px', fontFamily: 'inherit', fontSize: 14, background: C.bg, color: C.ink,
  };

  return (
    <div style={{ marginTop: 22, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: '24px 26px' }}>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>✎ Remix a recipe</div>
      <div style={{ fontSize: 12.5, color: C.muted65, lineHeight: 1.5, margin: '4px 0 16px', maxWidth: '62ch' }}>
        Paste (or upload) any recipe and tell Ember how to change it — “make it vegan”, “for 2 people”, “less spicy”,
        “swap the chicken for tofu”. It respects your diet & allergy settings.
      </div>

      {error && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <textarea
        value={recipeText}
        onChange={(e) => setRecipeText(e.target.value)}
        rows={5}
        placeholder="Paste your recipe here — title, ingredients, and steps…"
        style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: `1.5px solid ${C.line22}`, color: C.ink, fontWeight: 600, fontSize: 12.5, padding: '8px 14px', borderRadius: 999, cursor: 'pointer' }}>
          ⬆ Upload .txt
        </button>
        <input ref={fileRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
        <span style={{ fontSize: 11.5, color: C.muted55 }}>or paste above</span>
      </div>
      <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="What change do you want? e.g. make it gluten-free and for 2 people" style={{ ...inputStyle, marginBottom: 14 }} />

      <button onClick={remix} disabled={busy} style={{ background: C.green, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 26px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {busy && <Spinner size={15} color="#fff" />}✎ Revise recipe
      </button>

      {result && (
        <div style={{ marginTop: 18, border: `2px solid ${C.green}`, borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#fff', background: C.green, padding: '4px 11px', borderRadius: 4, marginBottom: 10 }}>
            ✎ Revised · {result.cuisine}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15 }}>{result.title}</div>
          <div style={{ fontSize: 13.5, color: C.muted65, lineHeight: 1.55, margin: '8px 0 4px' }}>{result.desc}</div>
          <div style={{ fontSize: 12, color: C.muted55, fontWeight: 600 }}>{result.meta}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => router.push(`/recipe/${result.id}`)} style={{ background: C.dark, color: C.bg, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              View full recipe →
            </button>
            <button onClick={save} style={{ background: 'none', border: `1.5px solid ${C.line22}`, color: C.ink, fontWeight: 600, fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer' }}>
              {saved ? '✓ Saved to cookbook' : '♡ Save to cookbook'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
