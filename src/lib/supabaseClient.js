import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Doesn't throw — the app still renders so the missing-config screen
  // (see AuthGate.jsx) can explain what to do, instead of a blank page.
  console.warn(
    'Supabase не настроен: заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (см. .env.example).'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');
export const isSupabaseConfigured = Boolean(url && anonKey);
