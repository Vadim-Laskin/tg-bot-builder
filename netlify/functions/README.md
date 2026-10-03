# Бэкенд — реализовано

- `telegram-webhook.js` — принимает `POST /.netlify/functions/telegram-webhook?botId=<uuid>`
  от Telegram, загружает бота и его флоу из Supabase (service role),
  прогоняет апдейт через `runFlow()` из `src/engine/flowEngine.js` с
  реальными вызовами Telegram Bot API и Groq, сохраняет обновлённые
  переменные/теги в таблицу `chat_state`.
- `set-webhook.js` — вызывается кнопкой «Подключить вебхук» в UI (модалка
  «Ключи бота»). Работает с JWT пользователя, поэтому Postgres RLS сам
  гарантирует, что вебхук можно зарегистрировать только для своего бота.

- `vk-auth.js` — мастер «Новый бот», шаг «выбрать сообщество»: меняет код входа VK ID
  на токен пользователя (на сервере, нигде не сохраняется) и возвращает список
  сообществ, где человек администратор. Нужна переменная `VK_APP_ID` (или `VITE_VK_APP_ID`).
- `vk-connect.js` — проверяет ключ сообщества (`verify`) и подключает сайт как
  Callback API-сервер сообщества (`connect`). Работает с JWT пользователя, как `set-webhook.js`.
- `vk-webhook.js` — принимает события Callback API ВКонтакте (`message_new`, `message_event`),
  гоняет их через тот же `runFlow()` и отвечает через VK API.

## Обязательные переменные окружения на Netlify

Site settings → Environment variables (не в `.env` — это серверные секреты):

| Переменная | Где взять |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL (то же значение, что и `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key (то же, что и `VITE_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key — секретный, обходит RLS, нужен только вебхуку |

Плюс `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` там же — они нужны
фронтенду при сборке. Для входа через ВКонтакте добавьте ещё `VITE_VK_APP_ID`
(нужен и фронтенду, и функции `vk-auth`).

После добавления/изменения переменных — Trigger deploy (Netlify не
подхватывает их «на лету»).
