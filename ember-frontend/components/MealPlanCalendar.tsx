'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mealPlanApi, nutritionApi, recipeApi, ApiError } from '@/lib/api';
import type { MealPlanEntry, MealSlot, Recipe } from '@/lib/types';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';
import { addDays, toYMD } from './NutritionTracker';

const SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { slot: 'lunch', label: 'Lunch', emoji: '☀️' },
  { slot: 'dinner', label: 'Dinner', emoji: '🌙' },
  { slot: 'snack', label: 'Snack', emoji: '🍎' },
];

/** Monday of the week containing d. */
export function weekStart(d: Date): Date {
  const day = d.getDay(); // 0 Sun … 6 Sat
  return addDays(d, day === 0 ? -6 : 1 - day);
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', border: `1.5px solid ${C.line22}`, borderRadius: 10, padding: '9px 11px',
  fontFamily: 'inherit', fontSize: 13, background: C.bg, color: C.ink,
};

/**
 * Weekly meal plan calendar. Plan free-text meals or saved cookbook recipes
 * into breakfast/lunch/dinner/snack slots, then push any entry to Google
 * Calendar once the integration is connected.
 */
export function MealPlanCalendar({ calendarConnected, onNeedCalendar }: { calendarConnected: boolean; onNeedCalendar: () => void }) {
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Recipe[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set()); // entries logged to the tracker this visit
  const [logging, setLogging] = useState<string | null>(null);

  // composer state
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftSlot, setDraftSlot] = useState<MealSlot>('dinner');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRecipe, setDraftRecipe] = useState('');
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const todayYmd = toYMD(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mealPlanApi.range(toYMD(start), toYMD(addDays(start, 6)));
      setEntries(res.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your plan — try again.');
    } finally {
      setLoading(false);
    }
  }, [start]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    recipeApi.list({ scope: 'saved' }).then((r) => setSaved(r.recipes)).catch(() => {});
  }, []);

  const rangeLabel = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(start, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  function openComposer(date: string) {
    const taken = new Set(entries.filter((e) => e.date === date).map((e) => e.slot));
    setDraftSlot(SLOTS.find((s) => !taken.has(s.slot))?.slot ?? 'dinner');
    setDraftDate(date);
    setDraftTitle('');
    setDraftRecipe('');
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draftDate || (!draftRecipe && !draftTitle.trim())) return;
    setSaving(true);
    setError(null);
    try {
      const { entry } = await mealPlanApi.upsert({
        date: draftDate,
        slot: draftSlot,
        recipeId: draftRecipe || null,
        title: draftTitle.trim(),
      });
      setEntries((cur) => [...cur.filter((x) => !(x.date === entry.date && x.slot === entry.slot)), entry]);
      setDraftDate(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that meal — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: MealPlanEntry) {
    setEntries((cur) => cur.filter((x) => x.id !== entry.id));
    try {
      await mealPlanApi.remove(entry.id);
    } catch {
      void load();
    }
  }

  /** Log a planned recipe to the nutrition tracker — macros come from the recipe. */
  async function logToTracker(entry: MealPlanEntry) {
    if (!entry.recipeId) return;
    setLogging(entry.id);
    setError(null);
    try {
      await nutritionApi.add({ date: entry.date, meal: entry.slot, name: entry.title, recipeId: entry.recipeId });
      setLogged((cur) => new Set(cur).add(entry.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log that to your tracker.');
    } finally {
      setLogging(null);
    }
  }

  async function sync(entry: MealPlanEntry) {
    if (!calendarConnected) return onNeedCalendar();
    setSyncing(entry.id);
    setError(null);
    try {
      await mealPlanApi.syncToCalendar(entry.id);
      setEntries((cur) => cur.map((x) => (x.id === entry.id ? { ...x, synced: true } : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that to Google Calendar.');
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div>
      {/* week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setStart((s) => addDays(s, -7))} aria-label="Previous week" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', border: `1.5px solid ${C.line22}`, background: 'transparent', color: C.muted75, borderRadius: 999, padding: '6px 13px' }}>‹</button>
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{rangeLabel}</span>
        <button onClick={() => setStart((s) => addDays(s, 7))} aria-label="Next week" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', border: `1.5px solid ${C.line22}`, background: 'transparent', color: C.muted75, borderRadius: 999, padding: '6px 13px' }}>›</button>
        {toYMD(weekStart(new Date())) !== toYMD(start) && (
          <button onClick={() => setStart(weekStart(new Date()))} style={{ fontFamily: mono, fontSize: 11.5, cursor: 'pointer', border: 'none', background: 'none', color: C.green, fontWeight: 700 }}>
            ↩ this week
          </button>
        )}
        {loading && <Spinner size={16} />}
      </div>

      {error && <div style={{ background: 'rgba(196,85,45,0.1)', color: '#8c3b2e', padding: '9px 13px', borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {/* composer */}
      {draftDate && (
        <form onSubmit={saveDraft} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, padding: '14px 16px', border: `1.5px dashed ${C.line22}`, borderRadius: 12, background: 'rgba(232,161,60,0.06)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, flex: 'none' }}>
            {new Date(`${draftDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <select className="ember-select" value={draftSlot} onChange={(e) => setDraftSlot(e.target.value as MealSlot)} style={{ flex: 'none' }}>
            {SLOTS.map((s) => (
              <option key={s.slot} value={s.slot}>{s.emoji} {s.label}</option>
            ))}
          </select>
          {saved.length > 0 && (
            <select className="ember-select" value={draftRecipe} onChange={(e) => { setDraftRecipe(e.target.value); if (e.target.value) setDraftTitle(''); }} style={{ flex: '1 1 170px', minWidth: 0 }}>
              <option value="">From your cookbook…</option>
              {saved.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          )}
          <input
            value={draftTitle}
            onChange={(e) => { setDraftTitle(e.target.value); if (e.target.value) setDraftRecipe(''); }}
            placeholder="…or type a meal"
            style={{ ...inputStyle, flex: '1 1 150px', minWidth: 0 }}
          />
          <button type="submit" disabled={saving || (!draftRecipe && !draftTitle.trim())} style={{ border: 'none', background: C.rust, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', opacity: saving || (!draftRecipe && !draftTitle.trim()) ? 0.5 : 1, flex: 'none' }}>
            {saving ? '…' : 'Plan it'}
          </button>
          <button type="button" onClick={() => setDraftDate(null)} style={{ border: 'none', background: 'none', color: C.muted65, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>
            Cancel
          </button>
        </form>
      )}

      {/* week grid */}
      <div className="plan-grid">
          {days.map((d) => {
            const ymd = toYMD(d);
            const isToday = ymd === todayYmd;
            const dayEntries = entries.filter((e) => e.date === ymd);
            return (
              <div key={ymd} style={{ background: isToday ? 'rgba(196,85,45,0.06)' : C.bg, border: isToday ? `1.5px solid rgba(196,85,45,0.4)` : `1px solid ${C.line}`, borderRadius: 12, padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 130 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: isToday ? C.rust : C.muted55 }}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: isToday ? C.rust : C.ink }}>{d.getDate()}</span>
                </div>
                {SLOTS.map(({ slot, emoji }) => {
                  const e = dayEntries.find((x) => x.slot === slot);
                  if (!e) return null;
                  return (
                    <div key={slot} className="plan-entry" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 8px', fontSize: 12, lineHeight: 1.3 }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                        <span style={{ flex: 'none' }}>{emoji}</span>
                        <span style={{ flex: 1, fontWeight: 700, minWidth: 0, overflowWrap: 'break-word' }}>{e.title}</span>
                        <button onClick={() => void remove(e)} title="Remove" className="plan-entry-x" style={{ border: 'none', background: 'none', color: C.muted55, fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 0, flex: 'none' }}>×</button>
                      </div>
                      {(() => {
                        const kcal = e.nutrition ? parseInt(String(e.nutrition.cal), 10) || 0 : 0;
                        return kcal > 0 ? (
                          <div style={{ marginTop: 4, fontFamily: mono, fontSize: 10, color: C.muted55 }}>~{kcal} kcal / serving</div>
                        ) : null;
                      })()}
                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <button
                          onClick={() => void sync(e)}
                          disabled={e.synced || syncing === e.id}
                          title={e.synced ? 'On your Google Calendar' : 'Add to Google Calendar'}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: e.synced ? 'default' : 'pointer', fontFamily: mono, fontSize: 10, fontWeight: 700, color: e.synced ? C.green : C.muted55 }}
                        >
                          {e.synced ? '✓ on calendar' : syncing === e.id ? 'adding…' : '+ add to calendar'}
                        </button>
                        {e.recipeId && (
                          <button
                            onClick={() => void logToTracker(e)}
                            disabled={logged.has(e.id) || logging === e.id}
                            title={logged.has(e.id) ? 'Logged to your nutrition tracker' : 'Log this meal to your nutrition tracker'}
                            style={{ border: 'none', background: 'none', padding: 0, cursor: logged.has(e.id) ? 'default' : 'pointer', fontFamily: mono, fontSize: 10, fontWeight: 700, color: logged.has(e.id) ? C.green : C.muted55 }}
                          >
                            {logged.has(e.id) ? '✓ logged' : logging === e.id ? 'logging…' : '+ log to tracker'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => openComposer(ymd)}
                  style={{ marginTop: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px dashed ${C.line22}`, background: 'transparent', color: C.muted65, borderRadius: 9, padding: '6px 0' }}
                >
                  + plan
                </button>
              </div>
            );
          })}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted55, marginTop: 10, lineHeight: 1.5 }}>
        Meals sync to Google Calendar at sensible times — breakfast 8:00, lunch 12:30, snack 15:30, dinner 18:30 (1-hour events, your local time).
      </div>
    </div>
  );
}
