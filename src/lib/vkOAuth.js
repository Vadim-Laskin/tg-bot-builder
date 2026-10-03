// Вход через ВКонтакте в всплывающем окне. Два шага — как в документации VK ID:
//  1) loginWithVk(): VK ID, OAuth 2.1 + PKCE, scope=groups → код; сервер (vk-auth)
//     меняет его на токен и возвращает список сообществ, где человек администратор;
//  2) loginCommunity(id): OAuth ВКонтакте (implicit) для выбранного сообщества → ключ сообщества.
// Окно возвращается на public/vk-callback.html, а та передаёт результат сюда.

export const VK_APP_ID = import.meta.env.VITE_VK_APP_ID || '';
export const VK_API_VERSION = '5.199';
const RESULT_KEY = 'flowbase-vk-oauth';

// адрес, который нужно указать в настройках приложения VK (точно, со схемой и путём)
export const vkRedirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}vk-callback.html`;

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = (text) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

// window.open нужно вызывать прямо из обработчика клика, до любых await,
// иначе браузер заблокирует окно
function openPopup() {
  const w = 520;
  const h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open('', 'flowbase-vk', `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) throw new Error('Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта и повторите.');
  try {
    localStorage.removeItem(RESULT_KEY);
  } catch {
    /* не критично */
  }
  return popup;
}

// ждём, пока vk-callback.html пришлёт результат (postMessage или localStorage)
function waitForResult(popup) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      try {
        localStorage.removeItem(RESULT_KEY);
      } catch {
        /* не критично */
      }
      fn(value);
    };
    const accept = (data) => {
      if (data?.type === 'flowbase-vk-oauth') {
        finish(resolve, {
          query: new URLSearchParams(data.search || ''),
          hash: new URLSearchParams((data.hash || '').replace(/^#/, ''))
        });
      }
    };
    const onMessage = (e) => e.origin === window.location.origin && accept(e.data);
    const onStorage = (e) => {
      if (e.key !== RESULT_KEY || !e.newValue) return;
      try {
        accept(JSON.parse(e.newValue));
      } catch {
        /* игнор */
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);

    const poll = setInterval(() => {
      if (!popup.closed) return;
      // окно закрыли — но результат мог прийти прямо перед этим
      setTimeout(() => {
        if (done) return;
        try {
          const stored = localStorage.getItem(RESULT_KEY);
          if (stored) return accept(JSON.parse(stored));
        } catch {
          /* игнор */
        }
        finish(reject, new Error('Вход отменён.'));
      }, 400);
    }, 500);
    const timeout = setTimeout(() => finish(reject, new Error('Время на вход вышло. Попробуйте ещё раз.')), 5 * 60 * 1000);
  });
}

function explainError(params) {
  const err = params.get('error');
  if (!err) return null;
  const desc = params.get('error_description') || err;
  if (err === 'access_denied') return 'Вы отказались предоставить доступ.';
  return `ВКонтакте вернул ошибку: ${desc}`;
}

// Шаг 1. → { code, codeVerifier, deviceId, redirectUri, state } — это уходит на сервер (vk-auth)
export async function loginWithVk() {
  if (!VK_APP_ID) throw new Error('Вход через ВКонтакте не настроен (нет VITE_VK_APP_ID).');
  const popup = openPopup(); // синхронно!

  try {
    const codeVerifier = randomString(64);
    const state = randomString(16);
    const challenge = b64url(await sha256(codeVerifier));
    const redirectUri = vkRedirectUri();

    const url = new URL('https://id.vk.ru/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: VK_APP_ID,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'groups'
    }).toString();
    popup.location.href = url.toString();

    const { query } = await waitForResult(popup);
    const error = explainError(query);
    if (error) throw new Error(error);
    if (query.get('state') !== state) throw new Error('Не сошёлся параметр state — вход прерван из соображений безопасности.');

    return { code: query.get('code'), codeVerifier, deviceId: query.get('device_id'), redirectUri, state };
  } finally {
    if (!popup.closed) popup.close();
  }
}

// Шаг 2. → { token, expiresIn } — ключ доступа выбранного сообщества
export async function loginCommunity(groupId) {
  if (!VK_APP_ID) throw new Error('Вход через ВКонтакте не настроен (нет VITE_VK_APP_ID).');
  const popup = openPopup(); // синхронно!

  try {
    const state = randomString(16);
    const url = new URL('https://oauth.vk.com/authorize');
    url.search = new URLSearchParams({
      client_id: VK_APP_ID,
      group_ids: String(groupId),
      redirect_uri: vkRedirectUri(),
      display: 'popup',
      scope: 'messages,manage',
      response_type: 'token',
      v: VK_API_VERSION,
      state
    }).toString();
    popup.location.href = url.toString();

    const { query, hash } = await waitForResult(popup);
    const error = explainError(hash) || explainError(query);
    if (error) throw new Error(error);

    // токен приходит как access_token_<id сообщества>=…
    const token = hash.get(`access_token_${groupId}`);
    if (!token) throw new Error('ВКонтакте не вернул ключ сообщества. Попробуйте ещё раз.');
    return { token, expiresIn: Number(hash.get('expires_in')) || 0 };
  } finally {
    if (!popup.closed) popup.close();
  }
}
