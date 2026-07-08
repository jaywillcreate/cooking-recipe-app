import { create } from 'zustand';
import type { Profile, User } from './types';
import { authApi, profileApi, recipeApi, setAccessToken } from './api';

interface AppState {
  ready: boolean; // auth bootstrap complete
  user: User | null;
  profile: Profile | null;
  savedCount: number;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;

  loadProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => Promise<void>;
  setSavedCount: (n: number) => void;
  refreshSavedCount: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  user: null,
  profile: null,
  savedCount: 0,

  /** On load, try to restore the session via the refresh cookie. */
  bootstrap: async () => {
    const ok = await authApi.refresh();
    if (!ok) {
      set({ ready: true, user: null, profile: null });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user });
      await get().loadProfile();
      await get().refreshSavedCount();
    } catch {
      set({ user: null, profile: null });
    } finally {
      set({ ready: true });
    }
  },

  login: async (email, password, remember = true) => {
    const { accessToken, user } = await authApi.login(email, password, remember);
    setAccessToken(accessToken);
    set({ user });
    await get().loadProfile();
    await get().refreshSavedCount();
  },

  register: async (email, password, name) => {
    const { accessToken, user } = await authApi.register(email, password, name);
    setAccessToken(accessToken);
    set({ user });
    await get().loadProfile();
    await get().refreshSavedCount();
  },

  logout: async () => {
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    set({ user: null, profile: null, savedCount: 0 });
  },

  loadProfile: async () => {
    const { profile } = await profileApi.get();
    set({ profile });
  },

  /** Optimistic profile update (mirrors the prototype's instant chip feedback). */
  patchProfile: async (patch) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ profile: next });
    try {
      await profileApi.patch(patch);
    } catch {
      set({ profile: current }); // roll back on failure
    }
  },

  setSavedCount: (n) => set({ savedCount: n }),

  refreshSavedCount: async () => {
    try {
      const { recipes } = await recipeApi.list({ scope: 'saved' });
      set({ savedCount: recipes.length });
    } catch {
      /* ignore */
    }
  },
}));
