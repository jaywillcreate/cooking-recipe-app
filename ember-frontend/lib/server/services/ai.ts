import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../logger';
import { query } from '../db';
import { generatedRecipeSchema, type GeneratedRecipe } from '../recipeSchema';

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

function buildPrompt(profile: ProfileForPrompt, params: Record<string, unknown>, hints?: PreferenceHints): string {
  const hintLine =
    hints && (hints.liked.length || hints.disliked.length)
      ? `Personalize using this feedback — the user has LIKED: [${hints.liked.join(', ')}]; the user has DISLIKED: [${hints.disliked.join(', ')}]. Lean toward liked styles and avoid disliked ones.\n`
      : '';
  return (
    'You are a world-class chef with deep expertise in every cuisine. Invent ONE new, original recipe.\n' +
    'Parameters: ' + JSON.stringify(params) + '\n' +
    'User profile: ' + JSON.stringify({ favoriteCuisines: profile.cuisines, diets: profile.diets, allergies: profile.allergies, skill: profile.skill, nutritionGoal: profile.goal }) + '\n' +
    hintLine +
    'Respect all dietary restrictions and allergies strictly. Match the skill level and time budget.\n' +
    (params.kidFriendly
      ? 'IMPORTANT: Make this KID-FRIENDLY — mild flavours with no strong spice or heat, familiar and fun, not too adventurous, and easy for young children to eat and to help prepare.\n'
      : '') +
    'Respond with ONLY valid JSON, no markdown fences, exactly this shape:\n' +
    '{"title":"...","cuisine":"...","mins":30,"time":"30 min","difficulty":"Beginner|Comfortable|Adventurous","desc":"one enticing sentence","tags":["...","..."],"ingredients":["quantity ingredient","..."],"steps":["...","..."],"nutrition":{"cal":450,"protein":30,"carbs":40,"fat":18}}'
  );
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no_json_in_response');
  return JSON.parse(match[0]);
}

/** Core model call → JSON extract → validate → log, with one retry. */
async function runGeneration(prompt: string, input: GenerateParams): Promise<GeneratedRecipe> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let inTok = 0;
    let outTok = 0;
    try {
      const msg = await client().messages.create({
        model: config.anthropicModel,
        max_tokens: config.anthropicMaxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      inTok = msg.usage.input_tokens;
      outTok = msg.usage.output_tokens;
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const recipe = generatedRecipeSchema.parse(extractJson(text));
      await logUsage(input, inTok, outTok, true, null);
      return recipe;
    } catch (err) {
      lastErr = err;
      await logUsage(input, inTok, outTok, false, (err as Error).message);
      logger.warn({ err: String(err), attempt }, 'Recipe generation attempt failed');
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('generation_failed');
}

export async function generateRecipe(input: GenerateParams): Promise<GeneratedRecipe> {
  return runGeneration(buildPrompt(input.profile, input.params, input.hints), input);
}

const RECIPE_SHAPE =
  '{"title":"...","cuisine":"...","mins":30,"time":"30 min","difficulty":"Beginner|Comfortable|Adventurous","desc":"one enticing sentence","tags":["...","..."],"ingredients":["quantity ingredient","..."],"steps":["...","..."],"nutrition":{"cal":450,"protein":30,"carbs":40,"fat":18}}';

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
  return runGeneration(prompt, { kind: 'create', userId: input.userId, profile: input.profile, params: {}, hints: input.hints });
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
