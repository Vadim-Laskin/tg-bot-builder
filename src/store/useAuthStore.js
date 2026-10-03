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
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      console.error('Не удалось загрузить профиль:', error.message);
      return;
    }
    if (!data) {
      // строки профиля нет — аккаунт создан раньше, чем в базе появился триггер.
      // Работаем как обычный пользователь; чинится SQL-запросом из supabase/schema.sql.
      console.warn('Профиль не найден в таблице profiles — выполните supabase/schema.sql (раздел «Профили»).');
      set({ profile: { id: user.id, email: user.email, is_admin: false } });
      return;
    }
    set({ profile: data });
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  }
}));
