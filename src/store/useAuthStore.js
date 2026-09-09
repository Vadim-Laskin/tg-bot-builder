import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient.js';

export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  initialized: false,

  async init() {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    set({ session });
    if (session) await get().loadProfile();
    set({ initialized: true });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      if (session) get().loadProfile();
      else set({ profile: null });
    });
  },

  async loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').single();
    if (error) {
      console.error('Не удалось загрузить профиль:', error.message);
      return;
    }
    set({ profile: data });
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  }
}));
