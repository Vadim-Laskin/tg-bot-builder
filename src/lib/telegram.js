// Tiny Telegram helpers used by the "Новый бот" wizard.

// 123456789:AAH… — digits, a colon, then ~35 url-safe characters
export const TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

// getMe is the cheapest way to check a token AND learn the bot's name.
// api.telegram.org allows browser (CORS) requests, so this also works with
// plain `npm run dev` — no Netlify Function needed.
export async function getBotInfo(token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) return { ok: true, bot: data.result }; // { first_name, username, ... }
    if (data.error_code === 401 || data.error_code === 404) {
      return { ok: false, error: 'Telegram не принял этот токен. Проверьте, что скопировали его целиком.' };
    }
    return { ok: false, error: data.description || 'Не удалось проверить токен.' };
  } catch {
    return { ok: false, error: 'Не удалось связаться с Telegram. Проверьте интернет и попробуйте ещё раз.' };
  }
}
