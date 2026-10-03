// Шаг «выбрать сообщество» в мастере «Новый бот».
// Принимает код входа VK ID (OAuth 2.1 + PKCE), меняет его на токен пользователя
// (на сервере — токен в браузер не отдаём и нигде не храним) и возвращает список
// сообществ, где человек администратор.
//
//   POST { code, codeVerifier, deviceId, redirectUri, state }
//   → { communities: [{ id, name, screenName, photo }] }
//
// ВАЖНО: права scope=groups выдаёт приложению только поддержка VK
// (devsupport@corp.vk.com) — без этого VK вернёт ошибку на этапе входа.

import { createClient } from '@supabase/supabase-js';

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });
const API_VERSION = '5.199';
// ВКонтакте переезжает на домен vk.ru; какой хост примет токен VK ID — пробуем по очереди
const API_HOSTS = ['https://api.vk.ru', 'https://api.vk.com'];

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return json(401, { error: 'не авторизовано' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const {
    data: { user }
  } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return json(401, { error: 'не авторизовано' });

  const clientId = process.env.VK_APP_ID || process.env.VITE_VK_APP_ID;
  if (!clientId) return json(500, { error: 'На сервере не задан VK_APP_ID (или VITE_VK_APP_ID).' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }
  const { code, codeVerifier, deviceId, redirectUri, state } = body;
  if (!code || !codeVerifier || !deviceId || !redirectUri) return json(400, { error: 'не хватает параметров входа' });

  // 1. код → токен пользователя
  let tok;
  try {
    const res = await fetch('https://id.vk.ru/oauth2/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: String(clientId),
        code,
        code_verifier: codeVerifier,
        device_id: deviceId,
        redirect_uri: redirectUri,
        state: state || ''
      })
    });
    tok = await res.json();
  } catch (e) {
    return json(502, { error: 'Не удалось связаться с VK ID: ' + e.message });
  }
  if (!tok?.access_token) {
    console.error('vk-auth: token exchange failed', tok?.error, tok?.error_description);
    return json(400, { error: `VK ID не выдал токен: ${tok?.error_description || tok?.error || 'неизвестная ошибка'}` });
  }

  // 2. список сообществ, где пользователь админ
  let last;
  for (const host of API_HOSTS) {
    try {
      const res = await fetch(`${host}/method/groups.get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: tok.access_token,
          v: API_VERSION,
          filter: 'admin',
          extended: '1',
          fields: 'screen_name',
          count: '1000'
        })
      });
      last = await res.json();
    } catch (e) {
      last = { error: { error_code: -1, error_msg: e.message } };
    }
    if (last.response) break;
  }

  if (!last?.response) {
    const code = last?.error?.error_code;
    console.error('vk-auth: groups.get failed', last?.error);
    if (code === 15 || code === 7 || code === 27 || code === 28) {
      return json(400, {
        error:
          'ВКонтакте не дал приложению доступ к списку сообществ (scope groups). Его нужно запросить у поддержки VK — devsupport@corp.vk.com. Пока можно подключить сообщество по ключу доступа.'
      });
    }
    return json(400, { error: last?.error?.error_msg || 'Не удалось получить список сообществ.' });
  }

  const communities = (last.response.items ?? []).map((g) => ({
    id: String(g.id),
    name: g.name,
    screenName: g.screen_name || `club${g.id}`,
    photo: g.photo_100 || g.photo_50 || g.photo_200 || null
  }));
  return json(200, { communities });
};
