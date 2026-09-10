# Бэкенд — реализовано

- `telegram-webhook.js` — принимает `POST /.netlify/functions/telegram-webhook?botId=<uuid>`
  от Telegram, загружает бота и его флоу из Supabase (service role),
  прогоняет апдейт через `runFlow()` из `src/engine/flowEngine.js` с
  реальными вызовами Telegram Bot API и Groq, сохраняет обновлённые
  переменные/теги в таблицу `chat_state`.
- `set-webhook.js` — вызывается кнопкой «Подключить вебхук» в UI (модалка
  «Ключи бота»). Работает с JWT пользователя, поэтому Postgres RLS сам
  гарантирует, что вебхук можно зарегистрировать только для своего бота.

## Обязательные переменные окружения на Netlify

Site settings → Environment variables (не в `.env` — это серверные секреты):

| Переменная | Где взять |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL (то же значение, что и `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key (то же, что и `VITE_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key — секретный, обходит RLS, нужен только вебхуку |

Плюс `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` там же — они нужны
фронтенду при сборке.

После добавления/изменения переменных — Trigger deploy (Netlify не
подхватывает их «на лету»).
