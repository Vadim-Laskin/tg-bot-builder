// Шаг «выбрать сообщество» в мастере «Новый бот».
// Принимает код входа VK ID (OAuth 2.1 + PKCE), меняет его на токен пользователя
// (на сервере — токен в браузер не отдаём и нигде не храним) и возвращает список
// сообществ, где человек администратор.
//
//   POST { code, codeVerifier, deviceId, redirectUri, state }
//   → { communities: [{ id, name, screenName, photo }] }
//
//   POST { action: 'resolve', screenName }   (нужен VK_SERVICE_KEY)
//   → { id } — числовой id сообщества по короткому адресу (vk.com/mygroup)
//
// ВАЖНО: токен VK ID (vk2.a.…) без выданного доступа groups не может вызывать
// методы API — VK отвечает ошибкой 1051 «Method is not available for this profile
// type». Доступ выдаёт поддержка VK (devsupport@corp.vk.com). Пока его нет, мастер
// предлагает подключить сообщество по ссылке (OAuth сообщества доступен любому
// приложению) или по ключу доступа.

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

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }

  if (body.action === 'resolve') return resolveScreenName(String(body.screenName || '').trim());

  const clientId = process.env.VK_APP_ID || process.env.VITE_VK_APP_ID;
  if (!clientId) return json(500, { error: 'На сервере не задан VK_APP_ID (или VITE_VK_APP_ID).' });

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
    if (code === 1051 || code === 15 || code === 7 || code === 27 || code === 28) {
      return json(400, {
        code: 'groups_unavailable',
        error:
          'ВКонтакте не дал приложению доступ к списку ваших сообществ (ошибка ' +
          code +
          '): токен входа VK ID без выданного доступа groups не может вызывать методы API. Доступ выдаёт поддержка VK — devsupport@corp.vk.com. Пока укажите сообщество по ссылке или вставьте ключ доступа.'
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

// Короткий адрес сообщества → числовой id (OAuth сообщества принимает только числа).
// Работает сервисным ключом приложения (VK_SERVICE_KEY: настройки приложения → «Сервисный ключ доступа»).
async function resolveScreenName(screenName) {
  const key = process.env.VK_SERVICE_KEY;
  if (!key) {
    return json(400, {
      code: 'no_service_key',
      error: 'Короткий адрес сообщества здесь не разобрать. Вставьте ссылку вида vk.com/club123456 или числовой ID (он показан в Управление → Настройки).'
    });
  }
  if (!/^[A-Za-z0-9_.]{2,64}$/.test(screenName)) return json(400, { error: 'Не похоже на адрес сообщества.' });

  let last;
  for (const host of API_HOSTS) {
    try {
      const res = await fetch(`${host}/method/utils.resolveScreenName`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ screen_name: screenName, access_token: key, v: API_VERSION })
      });
      last = await res.json();
    } catch (e) {
      last = { error: { error_code: -1, error_msg: e.message } };
    }
    if (last.response !== undefined) break;
  }

  const r = last?.response;
  if (!r || Array.isArray(r) || !r.object_id) return json(404, { error: 'Не нашёл такого адреса во ВКонтакте.' });
  if (r.type !== 'group' && r.type !== 'page' && r.type !== 'event') {
    return json(400, { error: 'Это адрес личной страницы, а не сообщества.' });
  }
  return json(200, { id: String(r.object_id) });
}
