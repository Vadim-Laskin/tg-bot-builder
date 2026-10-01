import { supabase } from './supabaseClient.js';

// Registers this site's telegram-webhook function for a bot (the token must
// already be saved on the bot row). Shared by «Ключи бота» and the new-bot
// wizard. Works only on Netlify / `netlify dev`, not plain `npm run dev`.
export async function connectWebhook(botId) {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    const res = await fetch('/.netlify/functions/set-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ botId })
    });
    const data = await res.json();
    return res.ok
      ? { ok: true, message: 'Готово — бот подключён, пишите ему в Telegram.' }
      : { ok: false, message: data.error || data.description || 'Не удалось подключить вебхук.' };
  } catch (e) {
    return { ok: false, message: 'Не удалось обратиться к серверу: ' + e.message };
  }
}
