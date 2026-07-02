import { z } from 'zod';

/** Validates the model's JSON output before it touches the DB. */
export const nutritionSchema = z.object({
  cal: z.union([z.number(), z.string()]).default(0),
  protein: z.union([z.number(), z.string()]).default(0),
  carbs: z.union([z.number(), z.string()]).default(0),
  fat: z.union([z.number(), z.string()]).default(0),
});

export const generatedRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  cuisine: z.string().min(1).max(60),
  mins: z.coerce.number().int().min(1).max(1440).default(30),
  time: z.string().max(30).optional(),
  difficulty: z.enum(['Beginner', 'Comfortable', 'Adventurous']).default('Comfortable'),
  desc: z.string().max(400).default(''),
  tags: z.array(z.string().max(40)).max(8).default([]),
  ingredients: z.array(z.string().max(200)).min(1).max(40),
  steps: z.array(z.string().max(1000)).min(1).max(30),
  nutrition: nutritionSchema.default({ cal: 0, protein: 0, carbs: 0, fat: 0 }),
});
export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

export const CUISINE_ACCENTS: Record<string, string> = {
  Italian: '#c4552d', Japanese: '#9a6a10', Thai: '#2f7a4d', Mexican: '#b0451f', Indian: '#a8621a',
  Korean: '#8c3b2e', Mediterranean: '#2f7a4d', French: '#7a5a2f', American: '#8c3b2e', Baking: '#9a6a10',
};

export const CUISINES = ['Italian', 'Japanese', 'Thai', 'Mexican', 'Indian', 'Korean', 'Mediterranean', 'French', 'American', 'Baking'];
export const DIETS = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Low-carb'];
export const SKILLS = ['Beginner', 'Comfortable', 'Adventurous'] as const;
export const TIMES = ['15 min', '30 min', '45 min', '1 hr+'] as const;
export const GOALS = ['Balanced', 'High protein', 'Low calorie', 'Heart healthy', 'No goal'] as const;
