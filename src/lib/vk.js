import { supabase } from './supabaseClient.js';

// Вызовы наших Netlify Functions для ВКонтакте (с JWT пользователя — доступ к
// своим ботам проверяет Postgres RLS, как в set-webhook).
async function callFunction(name, body) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  try {
    const res = await fetch(`/.netlify/functions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body)
    });
    if (res.status === 404) {
      return {
        ok: false,
        error: 'Серверные функции недоступны. Подключение ВКонтакте работает на Netlify (локально — через `netlify dev`).'
      };
    }
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: data.error || 'Ошибка сервера.', code: data.code };
  } catch (e) {
    return { ok: false, error: 'Не удалось обратиться к серверу: ' + e.message };
  }
}

// → { ok, group: { id, name, screenName, photo, members } }
export const vkVerifyToken = (token) => callFunction('vk-connect', { action: 'verify', token });

// подключает сайт как Callback API-сервер сообщества → { ok, warnings, url }
export const vkConnectBot = (botId) => callFunction('vk-connect', { action: 'connect', botId });

// обменивает код входа на токен (на сервере) и отдаёт список сообществ, где человек админ
// → { ok, communities: [{ id, name, screenName, photo }] }
export const vkListCommunities = (auth) => callFunction('vk-auth', auth);

// короткий адрес (vk.com/mygroup) → числовой id → { ok, id }
export const vkResolveCommunity = (screenName) => callFunction('vk-auth', { action: 'resolve', screenName });
