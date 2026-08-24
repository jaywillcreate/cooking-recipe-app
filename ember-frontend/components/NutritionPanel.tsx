'use client';
import { useCallback, useEffect, useState } from 'react';
import { nutritionCalcApi, ApiError, type CalculatedNutrition, type NutritionResponse } from '@/lib/api';
import { C, mono } from '@/lib/tokens';
import { Spinner } from './Spinner';
import { IconCheck, IconRefresh } from './icons';

/**
 * Per-serving macros with their provenance attached.
 *
 * Two states, and the difference is the point: numbers computed from USDA
 * FoodData Central (with a confidence rating and a per-ingredient audit trail)
 * or the model's estimate, labelled plainly as an estimate. A cook tracking
 * macros should always be able to tell which one they're looking at.
 *
 * `initial` lets a server component pass its own calculation in (the public
 * recipe page); `recipeId` + `canCalculate` let the signed-in app fetch and
 * refresh one.
 */
export function NutritionPanel({
  recipeId,
  estimate,
  initial = null,
  canCalculate = true,
}: {
  recipeId: string;
  /** The model's per-serving numbers, used until (and unless) a calculation lands. */
  estimate: { cal: number | string; protein: number | string; carbs: number | string; fat: number | string };
  initial?: CalculatedNutrition | null;
  canCalculate?: boolean;
}) {
  const [data, setData] = useState<CalculatedNutrition | null>(initial);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await nutritionCalcApi.get(recipeId);
      setData(res.nutrition);
      setError(res.nutrition ? null : explain(res));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not calculate nutrition.');
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    if (!initial && canCalculate) void load();
  }, [initial, canCalculate, load]);

  async function recalculate() {
    setLoading(true);
    setError(null);
    try {
      const res = await nutritionCalcApi.recalculate(recipeId);
      setData(res.nutrition);
      setError(res.nutrition ? null : explain(res));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not recalculate.');
    } finally {
      setLoading(false);
    }
  }

  const macros = data
    ? [
        { label: 'cal', value: data.perServing.cal, unit: '' },
        { label: 'protein', value: data.perServing.protein, unit: 'g' },
        { label: 'carbs', value: data.perServing.carbs, unit: 'g' },
        { label: 'fat', value: data.perServing.fat, unit: 'g' },
      ]
    : [
        { label: 'cal', value: estimate.cal, unit: '' },
        { label: 'protein', value: estimate.protein, unit: 'g' },
        { label: 'carbs', value: estimate.carbs, unit: 'g' },
        { label: 'fat', value: estimate.fat, unit: 'g' },
      ];

  const conf = data && CONFIDENCE[data.confidence];

  return (
    <div style={{ marginTop: 24, padding: 16, background: C.bg, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted55 }}>Per serving</span>
        {loading && <Spinner size={13} color={C.muted55} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, fontWeight: 600 }}>
        {macros.map((m) => (
          <div key={m.label}>
            {m.value}
            {m.unit} {m.label}
          </div>
        ))}
      </div>

      {/* Provenance — the whole reason this panel exists */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
        {data ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800,
                  letterSpacing: 0.6, textTransform: 'uppercase', color: conf!.color,
                  background: conf!.bg, borderRadius: 999, padding: '4px 9px',
                }}
              >
                <IconCheck size={11} color={conf!.color} strokeWidth={3} />
                {conf!.label} confidence
              </span>
              <span style={{ fontSize: 11.5, color: C.muted65 }}>
                {data.matchedCount} of {data.totalCount} ingredients matched
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.muted55, marginTop: 7, lineHeight: 1.5 }}>
              Calculated from ingredient quantities against{' '}
              <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener noreferrer" style={{ color: C.rust, fontWeight: 600 }}>
                USDA FoodData Central
              </a>
              , for {data.servings} servings.
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 9, flexWrap: 'wrap' }}>
              <button
                onClick={() => setOpen((o) => !o)}
                style={{ background: 'none', border: 'none', color: C.rust, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
              >
                {open ? 'Hide the maths' : 'Show the maths'}
              </button>
              {canCalculate && (
                <button
                  onClick={recalculate}
                  disabled={loading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: C.muted65, fontSize: 11.5, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  <IconRefresh size={12} />
                  Recalculate
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6,
                textTransform: 'uppercase', color: C.goldText, background: 'rgba(232,161,60,0.18)', borderRadius: 999, padding: '4px 9px',
              }}
            >
              Estimated
            </span>
            <div style={{ fontSize: 11, color: C.muted55, marginTop: 7, lineHeight: 1.5 }}>
              {loading ? 'Checking these against USDA food data…' : "These figures came with the recipe and haven't been verified against food data."}
            </div>
            {canCalculate && !loading && (
              <button
                onClick={recalculate}
                style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px solid ${C.line22}`, borderRadius: 999, color: C.ink, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '7px 13px', fontFamily: 'inherit' }}
              >
                <IconRefresh size={12} />
                Calculate from USDA data
              </button>
            )}
          </>
        )}

        {error && <div style={{ fontSize: 11, color: C.muted65, marginTop: 8, lineHeight: 1.5 }}>{error}</div>}
      </div>

      {/* Per-ingredient audit trail */}
      {open && data && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {data.breakdown.map((b, i) => (
            <div key={i} style={{ fontSize: 11.5, lineHeight: 1.45, opacity: b.negligible ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, color: C.ink }}>{b.line}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.muted65, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                  {b.fdcId ? `${b.cal} cal` : b.negligible ? '—' : 'not matched'}
                </span>
              </div>
              <div style={{ color: C.muted55, marginTop: 2 }}>
                {b.matchedTo ? (
                  <>
                    {b.matchedTo} · {b.note}
                  </>
                ) : (
                  b.note
                )}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: C.muted55, lineHeight: 1.5, marginTop: 2 }}>
            Unmatched ingredients contribute nothing to the totals, so a low match rate means the real figures are higher.
          </div>
        </div>
      )}
    </div>
  );
}

/** Say which of the three things went wrong, rather than one vague sentence. */
function explain(res: NutritionResponse): string {
  if (!res.configured) {
    return 'This deployment has no USDA API key, so lookups run on the shared demo key and are usually throttled. Add FDC_API_KEY to calculate for real.';
  }
  if (res.reason === 'unavailable') {
    return 'USDA FoodData Central did not respond (it rate-limits by the hour). Try again shortly.';
  }
  return 'Too few ingredients matched a USDA food for the total to be trustworthy, so the estimate stands.';
}

const CONFIDENCE = {
  high: { label: 'High', color: C.green, bg: 'rgba(47,122,77,0.13)' },
  medium: { label: 'Medium', color: C.goldText, bg: 'rgba(232,161,60,0.18)' },
  low: { label: 'Low', color: C.rust, bg: 'rgba(196,85,45,0.12)' },
} as const;
