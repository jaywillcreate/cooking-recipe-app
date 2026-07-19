import type { Collection, Profile, Recipe, User } from './types';

// Same-origin by default now that the API lives in this Next.js app (relative
// URLs → no CORS, refresh cookie is first-party). Override only for split hosting.
const BASE = process.env.NEXT_PUBLIC_API_BASE || '';

/**
 * Access token lives in memory only (never localStorage — avoids XSS token
 * theft). It's re-obtained on load via the httpOnly refresh cookie.
 */
let accessToken: string | null = null;
export const setAccessToken = (t: string | null): void => {
  accessToken = t;
};
export const getAccessToken = (): string | null => accessToken;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

interface ApiOpts {
  method?: string;
  body?: unknown;
  retry?: boolean;
}

/** Core request helper: attaches bearer token, retries once after refresh. */
export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.retry !== false) {
    if (await refreshAccessToken()) return api<T>(path, { ...opts, retry: false });
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { message?: string }).message || 'Request failed', (data as { error?: string }).error);
  }
  return data as T;
}

// ─── Typed endpoint helpers ─────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, name?: string) =>
    api<{ accessToken: string; user: User }>('/api/auth/register', { body: { email, password, name } }),
  login: (email: string, password: string, remember = true) =>
    api<{ accessToken: string; user: User }>('/api/auth/login', { body: { email, password, remember } }),
  refresh: refreshAccessToken,
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api<{ user: User }>('/api/auth/me'),
};

export const profileApi = {
  get: () => api<{ profile: Profile }>('/api/profile'),
  patch: (patch: Partial<Profile>) => api('/api/profile', { method: 'PATCH', body: patch }),
  setAvatar: (avatarUrl: string | null) => api('/api/profile/avatar', { method: 'PUT', body: { avatarUrl } }),
  changePassword: (body: { currentPassword?: string; newPassword: string }) =>
    api('/api/profile/password', { body }),
};

export const recipeApi = {
  list: (params: { scope?: string; q?: string; cuisine?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.scope) qs.set('scope', params.scope);
    if (params.q) qs.set('q', params.q);
    if (params.cuisine) qs.set('cuisine', params.cuisine);
    return api<{ recipes: Recipe[] }>(`/api/recipes?${qs.toString()}`);
  },
  get: (id: string) => api<{ recipe: Recipe }>(`/api/recipes/${id}`),
  email: (id: string, body: { to: string; note?: string }) =>
    api<{ sent: number; recipients: number; delivered: boolean }>(`/api/recipes/${id}/email`, { body }),
  feedback: (id: string, vote: 1 | -1 | 0) => api<{ vote: number }>(`/api/recipes/${id}/feedback`, { body: { vote } }),
};

export interface Store {
  name: string;
  brand?: string;
  address?: string;
  distanceMi: number;
  mapsUrl: string;
  priceTier: 1 | 2 | 3;
  priceLabel: '$' | '$$' | '$$$';
}
export interface StoreResult {
  location: { zip: string; city: string; state: string; lat: number; lon: number };
  stores: Store[];
  mapsUrl: string;
}
export const storesApi = {
  near: (zip: string) => api<StoreResult>(`/api/stores?zip=${encodeURIComponent(zip)}`),
};

export const shoppingApi = {
  email: (body: { title: string; items: string[]; to?: string }) =>
    api<{ sent: number; recipients: number; delivered: boolean }>('/api/shopping-list/email', { body }),
};

export const cookbookApi = {
  save: (recipeId: string) => api<{ saved: boolean; count: number }>(`/api/cookbook/saves/${recipeId}`, { method: 'POST' }),
  unsave: (recipeId: string) => api<{ saved: boolean; count: number }>(`/api/cookbook/saves/${recipeId}`, { method: 'DELETE' }),
  collections: () => api<{ collections: Collection[] }>('/api/cookbook/collections'),
  createCollection: (name: string) => api<{ collection: Collection }>('/api/cookbook/collections', { body: { name } }),
  deleteCollection: (id: string) => api(`/api/cookbook/collections/${id}`, { method: 'DELETE' }),
  toggleCollection: (collectionId: string, recipeId: string) =>
    api<{ inCollection: boolean }>(`/api/cookbook/collections/${collectionId}/toggle`, { body: { recipeId } }),
  addTag: (recipeId: string, tag: string) => api<{ tag: string }>(`/api/cookbook/tags/${recipeId}`, { body: { tag } }),
  removeTag: (recipeId: string, tag: string) =>
    api(`/api/cookbook/tags/${recipeId}/${encodeURIComponent(tag)}`, { method: 'DELETE' }),
};

export const sitesApi = {
  list: () => api<{ sites: string[] }>('/api/sites'),
  follow: (domain: string) => api<{ domain: string; via: string; recipe: Recipe }>('/api/sites', { body: { domain } }),
  unfollow: (domain: string) => api(`/api/sites/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
};

export const generateApi = {
  create: (body: { craving: string; cuisine: string; time: string; skill: string; onHand: string; kidFriendly?: boolean; save?: boolean }) =>
    api<{ recipe: Recipe; usage: { used: number; limit: number } }>('/api/generate', { body }),
  quota: () => api<{ used: number; limit: number; remaining: number }>('/api/generate/quota'),
  edit: (body: { recipeText: string; instruction: string; save?: boolean }) =>
    api<{ recipe: Recipe; usage: { used: number; limit: number } }>('/api/generate/edit', { body }),
};

export const dailyApi = {
  today: () => api<{ daily: (Recipe & { date: string; emailedAt: string | null }) | null }>('/api/daily/today'),
  generate: (force = false) =>
    api<{ recipe: Recipe; alreadyExisted: boolean }>(`/api/daily/generate?force=${force ? 1 : 0}`, { method: 'POST' }),
};

export const photoApi = {
  upload: (dataUrl: string, target: { kind: 'avatar' } | { kind: 'recipe'; recipeId: string }) =>
    api<{ url: string }>('/api/photos', { body: { dataUrl, target } }),
};

export type ImageProvider = 'gemini' | 'pollinations' | 'user';
export interface StepFeedback {
  tags?: string[];
  note?: string;
}
export const imagesApi = {
  /** Resolve a recipe hero (no stepIndex) or method-step image. */
  generate: (recipeId: string, stepIndex?: number) =>
    api<{ url: string; provider: ImageProvider; rev?: number }>('/api/images/generate', {
      body: stepIndex === undefined ? { recipeId } : { recipeId, stepIndex },
    }),
  /** Regenerate a step image applying the user's feedback; returns the improved image. */
  regenerateStep: (recipeId: string, stepIndex: number, feedback: StepFeedback) =>
    api<{ url: string; provider: ImageProvider; rev?: number; capped?: boolean }>('/api/images/generate', {
      body: { recipeId, stepIndex, regenerate: true, feedback },
    }),
  /** Record 👍/👎 feedback (with optional issue tags) on a step image. */
  feedback: (recipeId: string, stepIndex: number, vote: 1 | -1, tags?: string[], note?: string) =>
    api<{ ok: boolean }>('/api/images/feedback', { body: { recipeId, stepIndex, vote, tags, note } }),
};

export { BASE as API_BASE };
