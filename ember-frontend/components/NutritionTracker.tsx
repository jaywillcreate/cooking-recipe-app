'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import { nutritionApi, recipeApi, ApiError } from '@/lib/api';
import type { Macros, MealSlot, NutritionEntry, Recipe } from '@/lib/types';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';

const MEALS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { slot: 'lunch', label: 'Lunch', emoji: '☀️' },
  { slot: 'dinner', label: 'Dinner', emoji: '🌙' },
  { slot: 'snack', label: 'Snacks', emoji: '🍎' },
];

const MACROS: { key: keyof Macros; label: string; unit: string; color: string }[] = [
  { key: 'cal', label: 'Calories', unit: 'kcal', color: C.rust },
  { key: 'protein', label: 'Protein', unit: 'g', color: C.green },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: C.gold },
  { key: 'fat', label: 'Fat', unit: 'g', color: '#7a5a2f' },
];

export const toYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '9px 11px',
  fontFamily: 'inherit', fontSize: 13, background: C.bg, color: C.ink,
};

/**
 * Daily nutrition tracker: a 7-day strip, macro progress vs the profile's
 * targets, per-meal log, quick-add, and one-tap logging of saved recipes
 * (their macros come from the recipe's own nutrition data).
 */
export function NutritionTracker() {
  const { profile, patchProfile } = useApp();
  const today = useMemo(() => new Date(), []);
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [totals, setTotals] = useState<Macros>({ cal: 0, protein: 0, carbs: 0, fat: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Recipe[]>([]);
  const [editTargets, setEditTargets] = useState(false);

  // quick-add form
  const [meal, setMeal] = useState<MealSlot>('dinner');
  const [name, setName] = useState('');
  const [macros, setMacros] = useState<Partial<Macros>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await nutritionApi.day(d);
      setEntries(res.entries);
      setTotals(res.totals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your log — try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);
  useEffect(() => {
    recipeApi.list({ scope: 'saved' }).then((r) => setSaved(r.recipes)).catch(() => {});
  }, []);

  if (!profile) return null;
  const targets: Macros = { cal: profile.targetCalories, protein: profile.targetProtein, carbs: profile.targetCarbs, fat: profile.targetFat };

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' });
  const isToday = date === toYMD(today);

  async function add(body: { name: string; recipeId?: string } & Partial<Macros>) {
    setBusy(true);
    setError(null);
    try {
      const { entry } = await nutritionApi.add({ date, meal, ...body });
      setEntries((cur) => [...cur, entry]);
      setTotals((t) => ({ cal: t.cal + entry.cal, protein: t.protein + entry.protein, carbs: t.carbs + entry.carbs, fat: t.fat + entry.fat }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log that — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await add({ name: name.trim(), cal: macros.cal ?? 0, protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fat: macros.fat ?? 0 });
    setName('');
    setMacros({});
  }

  async function remove(entry: NutritionEntry) {
    setEntries((cur) => cur.filter((x) => x.id !== entry.id));
    setTotals((t) => ({ cal: t.cal - entry.cal, protein: t.protein - entry.protein, carbs: t.carbs - entry.carbs, fat: t.fat - entry.fat }));
    try {
      await nutritionApi.remove(entry.id);
    } catch {
      void load(date); // resync on failure
    }
  }

  return (
    <div>
      {/* day strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {days.map((d) => {
          const ymd = toYMD(d);
          const active = ymd === date;
          return (
            <button
              key={ymd}
              onClick={() => setDate(ymd)}
              style={{
                fontFamily: 'inherit', cursor: 'pointer', borderRadius: 12, padding: '8px 0', width: 52, textAlign: 'center',
                border: active ? '1.5px solid transparent' : `1.5px solid ${C.line15}`,
                background: active ? C.ink : 'transparent', color: active ? C.bg : C.muted75,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 }}>{dayLabel(d)}</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{d.getDate()}</div>
            </button>
          );
        })}
      </div>

      {/* macro progress vs targets */}
      <div className="macro-grid" style={{ marginBottom: 6 }}>
        {MACROS.map((m) => {
          const val = totals[m.key];
          const target = targets[m.key] || 0;
          const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
          const over = target > 0 && val > target;
          return (
            <div key={m.key} style={{ background: C.bg, borderRadius: 14, padding: '13px 15px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: over ? C.error : C.muted65, marginBottom: 8, whiteSpace: 'nowrap' }}>
                <b style={{ fontSize: 17, color: over ? C.error : C.ink, fontFamily: 'inherit' }}>{val}</b> / {target} {m.unit}
              </div>
              <div style={{ height: 7, borderRadius: 99, background: 'rgba(36,26,18,0.09)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: over ? C.error : m.color, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setEditTargets((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: mono, fontSize: 11.5, color: C.muted65, padding: '4px 0', marginBottom: 12 }}>
        {editTargets ? '▴ done editing targets' : '▾ edit daily targets'}
      </button>
      {editTargets && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '14px 16px', border: `1.5px dashed ${C.line22}`, borderRadius: 12 }}>
          {MACROS.map((m) => {
            const profKey = (`target${m.key === 'cal' ? 'Calories' : m.key[0]!.toUpperCase() + m.key.slice(1)}`) as 'targetCalories' | 'targetProtein' | 'targetCarbs' | 'targetFat';
            return (
              <label key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.muted65 }}>
                {m.label} ({m.unit})
                <input
                  type="number"
                  min={0}
                  value={profile[profKey]}
                  onChange={(e) => patchProfile({ [profKey]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  style={{ ...inputStyle, width: 96 }}
                />
              </label>
            );
          })}
        </div>
      )}

      {error && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '9px 13px', borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {/* per-meal log */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner size={22} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MEALS.map(({ slot, label, emoji }) => {
            const list = entries.filter((e) => e.meal === slot);
            if (!list.length) return null;
            return (
              <div key={slot}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55, marginBottom: 6 }}>
                  {emoji} {label}
                </div>
                {list.map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.muted65, flex: 'none' }}>
                      {e.cal} kcal · P{e.protein} C{e.carbs} F{e.fat}
                    </span>
                    <button onClick={() => void remove(e)} title="Remove" style={{ border: 'none', background: 'rgba(36,26,18,0.07)', color: C.muted65, width: 20, height: 20, borderRadius: '50%', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0, flex: 'none' }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {entries.length === 0 && (
            <div style={{ textAlign: 'center', padding: '26px 16px', color: C.muted55, fontSize: 13, background: C.bg, borderRadius: 12 }}>
              Nothing logged {isToday ? 'today' : 'this day'} yet — add a meal below{isToday ? ' and watch the bars fill up' : ''}.
            </div>
          )}
        </div>
      )}

      {/* add: saved recipe one-tap + manual quick-add */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.muted55 }}>Log to</span>
          {MEALS.map(({ slot, label, emoji }) => (
            <button
              key={slot}
              onClick={() => setMeal(slot)}
              style={{
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 999,
                border: meal === slot ? '1.5px solid transparent' : `1.5px solid ${C.line22}`,
                background: meal === slot ? C.green : 'transparent', color: meal === slot ? '#fff' : C.muted75,
              }}
            >
              {emoji} {label}
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <select
            className="ember-select"
            value=""
            disabled={busy}
            onChange={(e) => {
              const r = saved.find((x) => x.id === e.target.value);
              if (r) void add({ name: r.title, recipeId: r.id });
            }}
            style={{ width: '100%', marginBottom: 8 }}
          >
            <option value="">🍳 Log a recipe from your cookbook… (macros auto-filled)</option>
            {saved.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        )}
        <form onSubmit={quickAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quick add — e.g. Greek yogurt & honey" style={{ ...inputStyle, flex: '2 1 200px' }} />
          {MACROS.map((m) => (
            <input
              key={m.key}
              type="number"
              min={0}
              value={macros[m.key] ?? ''}
              onChange={(e) => setMacros((cur) => ({ ...cur, [m.key]: parseInt(e.target.value, 10) || 0 }))}
              placeholder={m.key === 'cal' ? 'kcal' : `${m.label[0]} g`}
              title={`${m.label} (${m.unit})`}
              style={{ ...inputStyle, width: 74, flex: 'none' }}
            />
          ))}
          <button type="submit" disabled={busy || !name.trim()} style={{ border: 'none', background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 18px', borderRadius: 10, cursor: busy || !name.trim() ? 'default' : 'pointer', opacity: busy || !name.trim() ? 0.5 : 1, flex: 'none' }}>
            {busy ? '…' : '+ Log'}
          </button>
        </form>
      </div>
    </div>
  );
}
