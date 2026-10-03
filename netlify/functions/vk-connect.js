// Вызывается из мастера «Новый бот» и из «Ключей бота» (с JWT пользователя,
// как set-webhook.js — доступ к своим ботам проверяет сам Postgres RLS).
//
//   { action: 'verify',  token }  → проверяет ключ сообщества и возвращает
//                                    название/аватар сообщества
//   { action: 'connect', botId }  → подключает этот сайт как Callback API-сервер
//                                    сообщества и включает нужные события

import { createClient } from '@supabase/supabase-js';
import { vkCall, VK_API_VERSION } from '../lib/vkApi.js';

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });
const SERVER_TITLE = 'Flowbase';

export const handler = async (event) => {
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
  return json(400, { error: 'неизвестное действие' });
};

function friendlyError(error) {
  const code = error?.error_code;
  if (code === 5) return 'ВКонтакте не принял этот ключ. Проверьте, что скопировали его целиком и он создан для сообщества.';
  if (code === 15 || code === 27 || code === 28) {
    return 'У этого ключа не хватает прав. При создании ключа отметьте «Сообщения сообщества» и «Управление сообществом».';
  }
  return error?.error_msg || 'Не удалось обратиться к ВКонтакте.';
}

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
  if (existing.error) return json(400, { error: friendlyError(existing.error) });
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
  if (added.error) return json(400, { error: friendlyError(added.error) });
  const serverId = added.response?.server_id;

  const settings = await vkCall(
    'groups.setCallbackSettings',
    { group_id, server_id: serverId, api_version: VK_API_VERSION, message_new: 1, message_event: 1 },
    token
  );
  if (settings.error) return json(400, { error: friendlyError(settings.error) });

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
