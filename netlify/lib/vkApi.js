export const VK_API_VERSION = '5.199';

// Один вызов метода VK API ключом сообщества. Никогда не бросает исключение:
// возвращает { response } или { error: { error_code, error_msg } }.
export async function vkCall(method, params, token) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  body.set('access_token', token);
  body.set('v', VK_API_VERSION);

  try {
    const res = await fetch(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    return await res.json();
  } catch (e) {
    return { error: { error_code: -1, error_msg: e.message } };
  }
}
