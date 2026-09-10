// Called from the "Ключи бота" modal when the user clicks "Подключить
// вебхук". Registers this site's telegram-webhook function as the bot's
// Telegram webhook. Runs with the *user's* JWT (not the service role), so
// Postgres RLS itself guarantees they can only do this for their own bots
// — no manual ownership check needed here.

import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'method not allowed' };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'не авторизовано' }) };

  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad json' }) };
  }

  const { botId } = body;
  if (!botId) return { statusCode: 400, body: JSON.stringify({ error: 'missing botId' }) };

  const { data: bot, error } = await supabase.from('bots').select('id, telegram_token').eq('id', botId).single();
  if (error || !bot) {
    return { statusCode: 404, body: JSON.stringify({ error: 'бот не найден или это не ваш бот' }) };
  }
  if (!bot.telegram_token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'сначала сохраните Telegram Bot Token' }) };
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!siteUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: 'не удалось определить адрес сайта' }) };
  }
  const webhookUrl = `${siteUrl}/.netlify/functions/telegram-webhook?botId=${botId}`;

  const tgRes = await fetch(`https://api.telegram.org/bot${bot.telegram_token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  const result = await tgRes.json();

  return {
    statusCode: result.ok ? 200 : 400,
    body: JSON.stringify({ ...result, webhookUrl })
  };
};
