export interface Recipe {
  id: string;
  origin: 'seed' | 'ai' | 'web' | 'daily';
  custom: boolean;
  title: string;
  cuisine: string;
  mins: number;
  time: string;
  difficulty: 'Beginner' | 'Comfortable' | 'Adventurous';
  rating: string | null;
  reviews: number;
  desc: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  nutrition: { cal: number | string; protein: number | string; carbs: number | string; fat: number | string };
  source: string | null;
  photo: string | null;
  accent: string;
  meta: string;
  sourceLabel: string;
  saved: boolean;
}

export interface Profile {
  name: string;
  email: string;
  emailDaily: boolean;
  cuisines: string[];
  diets: string[];
  allergies: string;
  skill: 'Beginner' | 'Comfortable' | 'Adventurous';
  time: '15 min' | '30 min' | '45 min' | '1 hr+';
  goal: 'Balanced' | 'High protein' | 'Low calorie' | 'Heart healthy' | 'No goal';
  onboarded: boolean;
  avatarUrl: string | null;
  dailyOnHand: string;
  timezone: string;
}

export interface Collection {
  id: string;
  name: string;
  recipeIds: string[];
}

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
}
