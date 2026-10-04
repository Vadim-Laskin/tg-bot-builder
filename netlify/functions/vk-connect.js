// Вызывается из мастера «Новый бот» и из «Ключей бота» (с JWT пользователя,
// как set-webhook.js — доступ к своим ботам проверяет сам Postgres RLS).
//
//   { action: 'verify',  token }  → проверяет ключ сообщества и возвращает
//                                    название/аватар сообщества
//   { action: 'connect', botId }  → подключает этот сайт как Callback API-сервер
//                                    сообщества и включает нужные события
//   { action: 'status',  botId }  → проверка подключения: что работает, а что нет

import { createClient } from '@supabase/supabase-js';
import { vkCall, VK_API_VERSION } from '../lib/vkApi.js';

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });
const SERVER_TITLE = 'Flowbase';

async function main(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return json(401, { error: 'не авторизовано' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
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

  if (body.action === 'verify') return verify(String(body.token || '').trim());
  if (body.action === 'connect') return connect(supabase, body.botId);
  if (body.action === 'status') return status(supabase, body.botId);
  return json(400, { error: 'неизвестное действие' });
}

function friendlyError(error) {
  const code = error?.error_code;
  if (code === 5) return 'ВКонтакте не принял этот ключ. Проверьте, что скопировали его целиком и он создан для сообщества.';
  if (code === 15 || code === 27 || code === 28) {
    return 'У этого ключа не хватает прав. При создании ключа отметьте «Сообщения сообщества» и «Управление сообществом».';
  }
  return error?.error_msg || 'Не удалось обратиться к ВКонтакте.';
}

// 1051 — ВК не разрешает этому типу ключа управлять Callback API через API.
// Это не поломка: сервер можно добавить руками в настройках сообщества.
const isRestricted = (error) => error?.error_code === 1051;
const MANUAL_HINT =
  'ВКонтакте не разрешает этому ключу настраивать Callback API автоматически (ошибка 1051). Подключите сервер вручную — инструкция в «🔑 Ключи бота». Или создайте ключ вручную (Управление → Работа с API → Ключи доступа) и нажмите «Подключить сообщество» ещё раз.';
const fail = (error) =>
  isRestricted(error) ? json(400, { code: 'manual_required', error: MANUAL_HINT }) : json(400, { error: friendlyError(error) });

async function verify(token) {
  if (!/^[A-Za-z0-9_.\-]{20,}$/.test(token)) {
    return json(400, { error: 'Это не похоже на ключ доступа сообщества. Он выглядит как длинный набор букв и цифр.' });
  }

  const res = await vkCall('groups.getById', { fields: 'members_count' }, token);
  if (res.error) return json(400, { error: friendlyError(res.error) });

  // в зависимости от версии API ответ — массив или { groups: [...] }
  const g = Array.isArray(res.response) ? res.response[0] : res.response?.groups?.[0];
  if (!g?.id) {
    return json(400, { error: 'Это ключ не сообщества. Создайте ключ в Управление → Работа с API → Ключи доступа.' });
  }

  return json(200, {
    group: {
      id: String(g.id),
      name: g.name,
      screenName: g.screen_name,
      photo: g.photo_100 || g.photo_200 || null,
      members: g.members_count ?? null
    }
  });
}

async function connect(supabase, botId) {
  if (!botId) return json(400, { error: 'missing botId' });

  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, platform, vk_group_id, vk_token, vk_secret')
    .eq('id', botId)
    .single();
  if (error || !bot) return json(404, { error: 'бот не найден или это не ваш бот' });
  if (bot.platform !== 'vk' || !bot.vk_token || !bot.vk_group_id) {
    return json(400, { error: 'это не бот ВКонтакте или не задан ключ сообщества' });
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!siteUrl) return json(500, { error: 'не удалось определить адрес сайта' });
  const url = `${siteUrl}/.netlify/functions/vk-webhook?botId=${bot.id}`;

  const token = bot.vk_token;
  const group_id = bot.vk_group_id;
  const warnings = [];

  // подключали раньше (например, нажали «Переподключить») — убираем свой прежний сервер
  const existing = await vkCall('groups.getCallbackServers', { group_id }, token);
  if (existing.error) return fail(existing.error);
  for (const s of existing.response?.items ?? []) {
    if (s.title === SERVER_TITLE) {
      await vkCall('groups.deleteCallbackServer', { group_id, server_id: s.id }, token);
    }
  }

  // во время этого вызова ВКонтакте сам стучится на наш адрес за подтверждением (event confirmation)
  const added = await vkCall(
    'groups.addCallbackServer',
    { group_id, url, title: SERVER_TITLE, secret_key: bot.vk_secret },
    token
  );
  if (added.error) return fail(added.error);
  const serverId = added.response?.server_id;

  const settings = await vkCall(
    'groups.setCallbackSettings',
    { group_id, server_id: serverId, api_version: VK_API_VERSION, message_new: 1, message_event: 1 },
    token
  );
  if (settings.error) return fail(settings.error);

  // Сообщения сообщества, кнопка «Начать» и возможности бота — желательно, но не критично
  const community = await vkCall(
    'groups.setSettings',
    { group_id, messages: 1, bots_capabilities: 1, bots_start_button: 1, bots_add_to_chat: 1 },
    token
  );
  if (community.error) {
    warnings.push(
      'Не удалось автоматически включить сообщения сообщества. Включите их вручную: Управление → Сообщения → «Сообщения сообщества» → Включены.'
    );
  }

  return json(200, { ok: true, serverId, warnings, url });
}

const SERVER_STATUS_RU = {
  ok: 'подтверждён',
  wait: 'ждёт подтверждения',
  failed: 'не подтверждён (ВКонтакте не смог достучаться)',
  unconfigured: 'не настроен'
};

// «Подключено, но не отвечает» — пройтись по всем звеньям цепочки и показать, какое порвано
async function status(supabase, botId) {
  if (!botId) return json(400, { error: 'missing botId' });
  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, platform, vk_group_id, vk_token, vk_confirmation')
    .eq('id', botId)
    .single();
  if (error || !bot) return json(404, { error: 'бот не найден или это не ваш бот' });
  if (bot.platform !== 'vk' || !bot.vk_token || !bot.vk_group_id) {
    return json(400, { error: 'это не бот ВКонтакте или не задан ключ сообщества' });
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const url = `${siteUrl}/.netlify/functions/vk-webhook?botId=${bot.id}`;
  const token = bot.vk_token;
  const group_id = bot.vk_group_id;

  const checks = [];
  const add = (ok, title, hint, soft = false) => checks.push({ ok, title, hint: ok ? undefined : hint, soft });

  const g = await vkCall('groups.getById', { group_id }, token);
  if (g.error) {
    add(false, 'Ключ сообщества', friendlyError(g.error));
    return json(200, { checks });
  }
  add(true, 'Ключ сообщества работает');

  // отвечает ли наш приёмник событий (проверяет и переменные Netlify, и доступ к базе, и ключ)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'confirmation', group_id: Number(group_id) })
    });
    const text = (await r.text()).trim();
    add(
      r.ok && text && text !== 'ok',
      'Приёмник событий на сайте отвечает',
      r.ok
        ? 'Приёмник ответил, но не выдал код подтверждения — проверьте, что бот есть в базе.'
        : `Приёмник ответил ошибкой ${r.status}. Проверьте на Netlify переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (и сделайте Trigger deploy), затем посмотрите Logs → Functions → vk-webhook.`
    );
  } catch (e) {
    add(false, 'Приёмник событий на сайте отвечает', `Не удалось достучаться до сайта: ${e.message}`);
  }

  const servers = await vkCall('groups.getCallbackServers', { group_id }, token);
  if (isRestricted(servers.error)) {
    add(
      false,
      'Callback API нельзя проверить автоматически',
      'ВКонтакте не даёт этому ключу читать настройки сервера. Проверьте вручную: Управление → Работа с API → Callback API — сервер должен быть «Подтверждён», а в «Типах событий» отмечены «Входящее сообщение» и «Callback-кнопки».',
      true
    );
  } else if (servers.error) {
    add(false, 'Callback API сообщества', friendlyError(servers.error));
  } else {
    const items = servers.response?.items ?? [];
    const ours = items.find((s) => s.url === url) ?? items.find((s) => s.title === SERVER_TITLE);
    if (!ours) {
      add(false, 'Сообщество подключено к сайту', 'Сервер Callback API не добавлен. Нажмите «🔌 Подключить сообщество».');
    } else {
      add(
        ours.status === 'ok',
        `Сервер Callback API: ${SERVER_STATUS_RU[ours.status] ?? ours.status}`,
        'ВКонтакте не подтвердил адрес сайта. Нажмите «🔌 Подключить сообщество» ещё раз.'
      );
      if (ours.url !== url) {
        add(false, 'Адрес сервера совпадает с адресом сайта', `В сообществе указан другой адрес (${ours.url}). Нажмите «🔌 Подключить сообщество».`);
      }
      const st = await vkCall('groups.getCallbackSettings', { group_id, server_id: ours.id }, token);
      const ev = st.response?.events ?? {};
      if (st.error) {
        add(false, 'Настройки событий', friendlyError(st.error));
      } else {
        add(!!+ev.message_new, 'Событие «Входящее сообщение» включено', 'Нажмите «🔌 Подключить сообщество» — оно включится само.');
        add(!!+ev.message_event, 'Событие «Нажатие на кнопку» включено', 'Без него inline-кнопки не будут работать. Нажмите «🔌 Подключить сообщество».');
      }
    }
  }

  const gs = await vkCall('groups.getSettings', { group_id }, token);
  if (isRestricted(gs.error)) {
    add(false, 'Настройки сообщений нельзя прочитать автоматически', 'Проверьте вручную: Управление → Сообщения → «Сообщения сообщества» → Включены.', true);
  } else if (gs.error) {
    add(false, 'Настройки сообщений сообщества', 'Не получилось прочитать настройки (ключу нужно право «Управление сообществом»).', true);
  } else {
    add(
      !!+gs.response.messages,
      'Сообщения сообщества включены',
      'Включите: Управление → Сообщения → «Сообщения сообщества» → Включены. Пока они выключены, бот не может писать.'
    );
    add(
      !!+gs.response.bots_capabilities,
      'Возможности ботов (кнопки) включены',
      'Включите: Управление → Сообщения → Настройки для бота → «Возможности ботов».',
      true
    );
  }

  return json(200, { checks });
}

// Любой сбой возвращаем читаемым JSON-ом, а не голым «502 Bad Gateway»
export const handler = async (event) => {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    return json(500, {
      error: `На Netlify не заданы переменные: ${missing.join(', ')}. Site settings → Environment variables, затем Deploy → Trigger deploy.`
    });
  }
  try {
    return await main(event);
  } catch (e) {
    console.error(`${'vk-connect'} crashed:`, e);
    return json(500, { error: `Сбой на сервере: ${e.message}` });
  }
};
