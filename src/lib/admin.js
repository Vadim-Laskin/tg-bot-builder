import { supabase } from './supabaseClient.js';

// Все операции админки идут через функции Postgres (security definer): они сами
// проверяют, что вызывает админ, и не отдают токены ботов.
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (!error) return { ok: true, data };
  const missing = /could not find the function|does not exist/i.test(error.message);
  return {
    ok: false,
    error: missing ? 'В базе нет функций админки — выполните supabase/schema.sql в SQL Editor.' : error.message
  };
}

export const adminListUsers = () => rpc('admin_list_users');
export const adminListBots = () => rpc('admin_list_bots');

export const adminUpdateProfile = ({ userId, displayName, note, isAdmin, blocked }) =>
  rpc('admin_update_profile', {
    p_user: userId,
    p_display_name: displayName,
    p_admin_note: note,
    p_is_admin: isAdmin,
    p_blocked: blocked
  });

export const adminSetBotStatus = (botId, status, reason = '') =>
  rpc('admin_set_bot_status', { p_bot: botId, p_status: status, p_reason: reason });

export async function adminDiagnostics() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  try {
    const res = await fetch('/.netlify/functions/admin-diagnostics', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` }
    });
    if (res.status === 404) return { ok: false, error: 'Серверные функции недоступны (локально — только через `netlify dev`).' };
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data } : { ok: false, error: data.error || 'Ошибка сервера.' };
  } catch (e) {
    return { ok: false, error: 'Не удалось обратиться к серверу: ' + e.message };
  }
}
