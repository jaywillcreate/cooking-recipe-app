import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';
import { query } from '../db';
import { generatedRecipeSchema, type GeneratedRecipe } from '../recipeSchema';
import { getCulinaryGuidance } from './culinaryAgent';

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic({ apiKey: config.anthropicApiKey }));

export interface ProfileForPrompt {
  cuisines: string[];
  diets: string[];
  allergies: string;
  skill: string;
  goal: string;
}
export interface PreferenceHints {
  liked: string[];
  disliked: string[];
}
export interface GenerateParams {
  kind: 'create' | 'daily' | 'web';
  userId?: string | null;
  profile: ProfileForPrompt;
  params: Record<string, unknown>;
  hints?: PreferenceHints;
}

/**
 * Research-backed rules for the step-by-step Method (from top culinary sources:
 * Serious Eats / America's Test Kitchen / pro recipe-writing guides). The
 * culinary research agent supplements these with fresher guidance over time.
 */
const METHOD_RULES =
  'METHOD (write the steps like a top-tier culinary site):\n' +
  '- Begin each step with a strong action verb; ONE main technique per step, in strict logical order. If prep matters, make step 1 the mise en place (what to chop/measure/preheat before heat goes on).\n' +
  '- Every cooking step states the heat level (e.g. medium-high), a realistic time range, AND a sensory doneness cue — how it should look, sound, smell or feel ("until deeply golden and nutty-smelling, 3–4 minutes"). NEVER "cook until done".\n' +
  '- Give safe internal temperatures in °F for meat, poultry, fish and eggs, and where to probe. Note resting time and carryover cooking when relevant ("rest 5 min; temperature will climb ~5°F").\n' +
  '- Name the pan/pot size and utensil when it matters ("12-inch skillet", "rubber spatula"). Season in layers as you go, tasting where safe.\n' +
  '- Where technique matters, add a short WHY in the step ("don\'t crowd the pan — steam prevents browning"; "off heat so the garlic doesn\'t scorch").\n' +
  '- Steps must be self-contained and specific enough that a nervous beginner could follow them; include visual descriptions of what the food looks like at each stage.\n' +
  '- LENGTH: at most 12 steps, each under 55 words. Be complete but economical — cues and temps, not prose.\n';

const RECIPE_SHAPE =
  '{"title":"...","cuisine":"...","mins":30,"time":"30 min","difficulty":"Beginner|Comfortable|Adventurous","desc":"one enticing sentence","tags":["...","..."],"ingredients":["quantity ingredient","..."],"steps":["...","..."],"nutrition":{"cal":450,"protein":30,"carbs":40,"fat":18}}';

function buildPrompt(profile: ProfileForPrompt, params: Record<string, unknown>, hints?: PreferenceHints, guidance?: string, variants = 1): string {
  const hintLine =
    hints && (hints.liked.length || hints.disliked.length)
      ? `Personalize using this feedback — the user has LIKED: [${hints.liked.join(', ')}]; the user has DISLIKED: [${hints.disliked.join(', ')}]. Lean toward liked styles and avoid disliked ones.\n`
      : '';
  return (
    'You are a world-class chef with deep expertise in every cuisine. Invent ONE new, original recipe.\n' +
    // Explicit request — authoritative. It always wins over general preferences.
    'THIS REQUEST (explicit instructions — follow exactly; these override the general preferences below):\n' +
    JSON.stringify(params) + '\n' +
    // Background preferences only. NOTE: no skill/time here — those come from the request.
    'General preferences (background context only): ' +
    JSON.stringify({ favoriteCuisines: profile.cuisines, diets: profile.diets, allergies: profile.allergies, nutritionGoal: profile.goal }) + '\n' +
    hintLine +
    'RULES:\n' +
    '- Dietary restrictions and allergies are ABSOLUTE — never use them or their derivatives, no exceptions.\n' +
    '- Cuisine: if the request names a specific cuisine, use exactly that one. Only if it says "Surprise me" or names none, pick one from favoriteCuisines (or your choice if none).\n' +
    '- AUTHENTICITY: build the dish from ingredients, seasonings, pantry staples, and techniques that are genuinely traditional to the chosen cuisine. Do not substitute generic or out-of-place ingredients; the result should read as authentically that cuisine.\n' +
    '- Match the requested time budget and skill level; scale ingredient quantities to the requested number of servings if given.\n' +
    (params.kidFriendly
      ? '- KID-FRIENDLY: mild flavours with no strong spice or heat, familiar and fun, not too adventurous, easy for young children to eat and help prepare.\n'
      : '') +
    (params.cuisine === 'Baking'
      ? `- BAKING: This is a baking request.${params.bakeType ? ` Bake type: ${String(params.bakeType)}.` : ''}${params.bakeFlavor ? ` Flavour direction: ${String(params.bakeFlavor)}.` : ''} Give PRECISE measurements (include weights in grams for flour, sugar, butter and other key ingredients, not just cups), the correct oven temperature (°F) and bake time, the proper mixing method, any resting/proofing/chilling, and clear doneness cues. Set the "cuisine" field to "Baking".\n`
      : '') +
    (params.cuisine !== 'Baking' && (params.bakeType || params.bakeFlavor)
      ? `- BAKING OPTION: If you choose Baking as this recipe's cuisine${params.bakeType ? ` (bake type: ${String(params.bakeType)})` : ''}${params.bakeFlavor ? ` (flavour: ${String(params.bakeFlavor)})` : ''}, then follow baking rules: precise gram weights, correct oven temperature (°F) and bake time, proper mixing method, any resting/proofing/chilling, and clear doneness cues.\n`
      : '') +
    METHOD_RULES +
    (guidance ? 'CURRENT CULINARY GUIDANCE (research-refreshed; also apply when writing the steps):\n' + guidance + '\n' : '') +
    (variants > 1
      ? `VARIATIONS: create ${variants} DISTINCT recipes for this one request — meaningfully different takes (e.g. one classic/traditional, one creative twist, one quick & streamlined), each with its own title, and every one still satisfying THIS REQUEST and every rule above.\n` +
        `Respond with ONLY a valid JSON array of exactly ${variants} recipe objects, no markdown fences, each object exactly this shape:\n[` + RECIPE_SHAPE + ', ...]'
      : 'Respond with ONLY valid JSON, no markdown fences, exactly this shape:\n' + RECIPE_SHAPE)
  );
}

function extractJson(text: string): unknown {
  // Tolerate markdown fences and any preamble/afterword around the JSON object.
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no_json_in_response');
  return JSON.parse(match[0]);
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) return JSON.parse(arr[0]);
  // Model occasionally returns a single object even when asked for an array.
  return [extractJson(cleaned)];
}

/** Core model call → JSON extract → validate → log, with one retry. */
async function runGeneration<T>(
  prompt: string,
  input: GenerateParams,
  parse: (text: string) => T,
  // Detailed method steps can be long; the retry gets double the budget so a
  // response truncated at max_tokens (→ unparseable JSON) succeeds on pass 2.
  maxTokensFor: (attempt: number) => number = (attempt) => config.anthropicMaxTokens * (attempt + 1),
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let inTok = 0;
    let outTok = 0;
    try {
      const msg = await client().messages.create({
        model: config.anthropicModel,
        max_tokens: maxTokensFor(attempt),
        messages: [{ role: 'user', content: prompt }],
      });
      inTok = msg.usage.input_tokens;
      outTok = msg.usage.output_tokens;
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      if (msg.stop_reason === 'max_tokens') logger.warn({ attempt, outTok }, 'Recipe generation hit max_tokens — response truncated');
      const parsed = parse(text);
      await logUsage(input, inTok, outTok, true, null);
      return parsed;
    } catch (err) {
      lastErr = err;
      await logUsage(input, inTok, outTok, false, (err as Error).message);
      logger.warn({ err: String(err), attempt }, 'Recipe generation attempt failed');
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('generation_failed');
}

export async function generateRecipe(input: GenerateParams): Promise<GeneratedRecipe> {
  // Latest agent-researched guidance (cached; empty string until first refresh).
  const guidance = await getCulinaryGuidance().catch(() => '');
  return runGeneration(buildPrompt(input.profile, input.params, input.hints, guidance), input, (text) =>
    generatedRecipeSchema.parse(extractJson(text)),
  );
}

/**
 * One model call → several distinct takes on the same request (still one
 * ai_usage row, so a multi-variant create costs one generation of the daily
 * quota). Tolerates the model returning fewer objects than asked.
 */
export async function generateRecipeVariants(input: GenerateParams, count = 3): Promise<GeneratedRecipe[]> {
  const guidance = await getCulinaryGuidance().catch(() => '');
  const prompt = buildPrompt(input.profile, input.params, input.hints, guidance, count);
  const variants = await runGeneration(
    prompt,
    input,
    (text) => z.array(generatedRecipeSchema).min(1).parse(extractJsonArray(text)),
    (attempt) => config.anthropicMaxTokens * count * (attempt + 1),
  );
  return variants.slice(0, count);
}

export interface EditParams {
  userId?: string | null;
  profile: ProfileForPrompt;
  hints?: PreferenceHints;
  recipeText: string;
  instruction: string;
}

/** Revise a user-supplied recipe according to their instruction. */
export async function editRecipe(input: EditParams): Promise<GeneratedRecipe> {
  const prompt =
    'You are a world-class chef. The user has an existing recipe and wants it revised.\n' +
    'EXISTING RECIPE (as provided by the user):\n"""\n' + input.recipeText.slice(0, 4000) + '\n"""\n' +
    'REQUESTED CHANGE: ' + input.instruction + '\n' +
    'User profile: ' + JSON.stringify({ diets: input.profile.diets, allergies: input.profile.allergies, skill: input.profile.skill, nutritionGoal: input.profile.goal }) + '\n' +
    'Apply the requested change while keeping the spirit of the original. Respect all dietary restrictions and allergies strictly. If the original is vague or incomplete, fill in sensible details.\n' +
    'Return the COMPLETE revised recipe as ONLY valid JSON, no markdown fences, exactly this shape:\n' +
    RECIPE_SHAPE;
  return runGeneration(prompt, { kind: 'create', userId: input.userId, profile: input.profile, params: {}, hints: input.hints }, (text) =>
    generatedRecipeSchema.parse(extractJson(text)),
  );
}

async function logUsage(input: GenerateParams, inTok: number, outTok: number, success: boolean, error: string | null) {
  try {
    await query(
      `INSERT INTO ai_usage (user_id, kind, model, input_tokens, output_tokens, success, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.userId ?? null, input.kind, config.anthropicModel, inTok, outTok, success, error],
    );
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to write ai_usage row');
  }
}
