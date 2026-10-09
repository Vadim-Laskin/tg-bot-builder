import { supabase } from './supabaseClient.js';

async function call(body) {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  try {
    const res = await fetch('/.netlify/functions/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body)
    });
    if (res.status === 404) return { ok: false, error: 'Серверные функции недоступны (локально — только через `netlify dev`).' };
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: data.error || 'Ошибка сервера.' };
  } catch (e) {
    return { ok: false, error: 'Не удалось обратиться к серверу: ' + e.message };
  }
}

export const broadcastPreview = (botId, audience, tag) => call({ action: 'preview', botId, audience, tag });
export const broadcastStart = (botId, text, audience, tag) => call({ action: 'start', botId, text, audience, tag });
export const broadcastStep = (broadcastId) => call({ action: 'step', broadcastId });
export const broadcastCancel = (broadcastId) => call({ action: 'cancel', broadcastId });
