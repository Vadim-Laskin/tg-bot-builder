# Бэкенд (фаза 2 — ещё не реализовано)

Эта папка — куда лягут Netlify Functions, когда дойдём до бэкенда:

- `telegram-webhook.js` — принимает `POST /webhook/:botId` от Telegram,
  собирает `context` (переменные/теги пользователя из Supabase),
  вызывает `runFlow()` из `src/engine/flowEngine.js` с "боевым" `api`
  (реальные `fetch` к Telegram Bot API и к Groq), сохраняет обновлённый
  контекст обратно в Supabase.
- `set-webhook.js` — вызывается при сохранении токена бота в UI,
  делает `setWebhook` в Telegram API на `<sайт>/.netlify/functions/telegram-webhook/<botId>`.

Движок (`src/engine/`) уже спроектирован так, чтобы работать здесь без
изменений — он ничего не знает про React или про то, где выполняется.
Единственное, что нужно написать — реализацию `api` (sendMessage, callGroq,
httpRequest, resolveChain) поверх настоящих `fetch`-запросов и Supabase.
