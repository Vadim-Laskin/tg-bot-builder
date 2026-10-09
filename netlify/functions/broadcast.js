// Рассылки. Отправка идёт порциями: фронт вызывает `step`, пока рассылка не завершится
// (у Netlify-функции ~10 секунд, на тысячи людей за один вызов не хватит).
//
//   POST { action: 'preview', botId, audience, tag } → { count }
//   POST { action: 'start',   botId, text, audience, tag } → { broadcast }
//   POST { action: 'step',    broadcastId } → { broadcast }
//   POST { action: 'cancel',  broadcastId } → { broadcast }
//
// Получатели — только личные чаты людей, которые писали боту (chat_state).
// Группы, беседы и каналы исключены.

import { createClient } from '@supabase/supabase-js';
import { vkCall } from '../lib/vkApi.js';
import { formatMessageText, formatPlainText } from '../../src/engine/formatText.js';

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });
const VK_PEER_OFFSET = 2000000000;
const TG_BATCH = 25;
const VK_BATCH = 90;
const MAX_TEXT = 4000;

const admin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// личный чат человека? Telegram: id группы отрицательный; VK: беседы — peer_id ≥ 2·10⁹
function isPrivate(bot, row) {
  if (row.chat_type && row.chat_type !== 'private') return false;
  if (bot.platform === 'vk') return Number(row.chat_id) > 0 && Number(row.chat_id) < VK_PEER_OFFSET;
  return !String(row.chat_id).startsWith('-');
}

async function recipientsOf(db, bot, audience, tag) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('chat_state')
      .select('chat_id, chat_type, tags')
      .eq('bot_id', bot.id)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data) {
      if (!isPrivate(bot, row)) continue;
      if (audience === 'tag' && !(row.tags ?? []).includes(tag)) continue;
      out.push(row.chat_id);
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function refresh(db, id, finishIfDone = true) {
  const count = async (status) =>
    (await db.from('broadcast_recipients').select('chat_id', { count: 'exact', head: true }).eq('broadcast_id', id).eq('status', status)).count ?? 0;
  const [sent, failed, pending] = await Promise.all([count('sent'), count('failed'), count('pending')]);
  const patch = { sent, failed };
  if (finishIfDone && pending === 0) Object.assign(patch, { status: 'done', finished_at: new Date().toISOString() });
  const { data } = await db.from('broadcasts').update(patch).eq('id', id).select().single();
  return data;
}

async function sendTelegram(bot, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${bot.telegram_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: formatMessageText(text), parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const data = await res.json();
    if (data.ok) return { ok: true };
    if (data.error_code === 429) return { ok: false, retry: true, error: 'лимит Telegram' };
    return { ok: false, error: data.description || 'ошибка Telegram' };
  } catch (e) {
    return { ok: false, retry: true, error: e.message };
  }
}

async function stepTelegram(db, bot, b, rows) {
  const results = [];
  for (let i = 0; i < rows.length; i += 10) {
    const part = rows.slice(i, i + 10);
    results.push(...(await Promise.all(part.map((r) => sendTelegram(bot, r.chat_id, b.text).then((x) => ({ chat_id: r.chat_id, ...x }))))));
    await new Promise((r) => setTimeout(r, 400)); // ≈25 сообщений/с — в пределах лимита Telegram
  }
  return results;
}

async function stepVk(db, bot, b, rows) {
  const res = await vkCall(
    'messages.send',
    {
      peer_ids: rows.map((r) => r.chat_id).join(','),
      random_id: Math.floor(Math.random() * 2 ** 31),
      message: formatPlainText(b.text).slice(0, 4096)
    },
    bot.vk_token
  );
  if (res.error) {
    const fatal = [5, 7, 15, 1051].includes(res.error.error_code);
    return rows.map((r) => ({ chat_id: r.chat_id, ok: false, retry: !fatal, error: res.error.error_msg }));
  }
  const byPeer = Object.fromEntries((res.response ?? []).map((x) => [String(x.peer_id), x]));
  return rows.map((r) => {
    const x = byPeer[r.chat_id];
    if (x && !x.error) return { chat_id: r.chat_id, ok: true };
    return { chat_id: r.chat_id, ok: false, error: x?.error?.description || x?.error || 'не доставлено (человек запретил сообщения)' };
  });
}

async function main(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return json(401, { error: 'не авторизовано' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: 'На Netlify не задан SUPABASE_SERVICE_ROLE_KEY.' });

  // от имени пользователя: RLS сама отдаёт только его ботов и рассылки
  const userDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user }
  } = await userDb.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return json(401, { error: 'не авторизовано' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }
  const db = admin();

  const loadBot = async (botId) => {
    const { data } = await userDb.from('bots').select('id').eq('id', botId).maybeSingle(); // доступ только к своему
    if (!data) return null;
    return (await db.from('bots').select('*').eq('id', botId).single()).data;
  };

  if (body.action === 'preview' || body.action === 'start') {
    const bot = await loadBot(body.botId);
    if (!bot) return json(404, { error: 'бот не найден или это не ваш бот' });
    const audience = body.audience === 'tag' ? 'tag' : 'all';
    const tag = String(body.tag || '').trim();
    if (audience === 'tag' && !tag) return json(400, { error: 'Выберите тег.' });

    const ids = await recipientsOf(db, bot, audience, tag);
    if (body.action === 'preview') return json(200, { count: ids.length });

    if (bot.status && bot.status !== 'active') return json(400, { error: 'Бот заморожен или отключён администратором — рассылка невозможна.' });
    if (!(bot.platform === 'vk' ? bot.vk_token : bot.telegram_token)) return json(400, { error: 'У бота не задан токен/ключ.' });
    const text = String(body.text || '').trim().slice(0, MAX_TEXT);
    if (!text) return json(400, { error: 'Напишите текст рассылки.' });
    if (ids.length === 0) return json(400, { error: 'Некому отправлять: подходящих людей, писавших боту, нет.' });

    const { data: b, error } = await db.from('broadcasts').insert({ bot_id: bot.id, text, audience, tag, total: ids.length }).select().single();
    if (error) return json(500, { error: error.message });
    for (let i = 0; i < ids.length; i += 500) {
      await db.from('broadcast_recipients').insert(ids.slice(i, i + 500).map((chat_id) => ({ broadcast_id: b.id, chat_id })));
    }
    return json(200, { broadcast: b });
  }

  if (body.action === 'step' || body.action === 'cancel') {
    const { data: own } = await userDb.from('broadcasts').select('id').eq('id', body.broadcastId).maybeSingle();
    if (!own) return json(404, { error: 'рассылка не найдена' });
    const { data: b } = await db.from('broadcasts').select('*').eq('id', body.broadcastId).single();

    if (body.action === 'cancel') {
      const { data } = await db.from('broadcasts').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'sending').select().maybeSingle();
      return json(200, { broadcast: data ?? b });
    }
    if (b.status !== 'sending') return json(200, { broadcast: b });

    const bot = (await db.from('bots').select('*').eq('id', b.bot_id).single()).data;
    if (bot.status && bot.status !== 'active') return json(400, { error: 'Бот заморожен или отключён администратором.' });

    const vk = bot.platform === 'vk';
    const { data: rows } = await db
      .from('broadcast_recipients')
      .select('chat_id')
      .eq('broadcast_id', b.id)
      .eq('status', 'pending')
      .limit(vk ? VK_BATCH : TG_BATCH);

    if (rows?.length) {
      const results = vk ? await stepVk(db, bot, b, rows) : await stepTelegram(db, bot, b, rows);
      const settled = results.filter((r) => r.ok || !r.retry);
      await Promise.all(
        settled.map((r) =>
          db.from('broadcast_recipients').update({ status: r.ok ? 'sent' : 'failed', error: r.ok ? '' : String(r.error ?? '').slice(0, 200) }).eq('broadcast_id', b.id).eq('chat_id', r.chat_id)
        )
      );
      const sentRows = settled.filter((r) => r.ok).map((r) => ({ bot_id: bot.id, chat_id: r.chat_id, direction: 'out', text: `📢 ${b.text}` }));
      if (sentRows.length) await db.from('chat_messages').insert(sentRows);
    }
    return json(200, { broadcast: await refresh(db, b.id) });
  }

  return json(400, { error: 'unknown action' });
}

export const handler = async (event) => {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) return json(500, { error: `На Netlify не заданы переменные: ${missing.join(', ')}` });
  try {
    return await main(event);
  } catch (e) {
    console.error('broadcast crashed:', e);
    return json(500, { error: `Сбой на сервере: ${e.message}` });
  }
};
