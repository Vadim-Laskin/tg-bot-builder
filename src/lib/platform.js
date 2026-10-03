// Два мессенджера: Telegram и ВКонтакте. Общие мелочи, чтобы не размазывать
// `bot.platform === 'vk'` по компонентам.

export const isVk = (bot) => bot?.platform === 'vk';

export const platformLabel = (bot) => (isVk(bot) ? 'ВКонтакте' : 'Telegram');

// «токен задан» для Telegram-бота — токен BotFather, для VK-бота — ключ сообщества
export const botHasToken = (bot) => Boolean(isVk(bot) ? bot.vkToken : bot.telegramToken);

export const tokenStatusLabel = (bot) =>
  botHasToken(bot) ? (isVk(bot) ? 'ключ задан' : 'токен задан') : isVk(bot) ? 'ключ не задан' : 'токен не задан';

// secret_key Callback API: до 50 символов, только латиница и цифры
export function randomVkSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
