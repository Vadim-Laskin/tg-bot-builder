// Used by the in-editor "Тест" panel to run a flow against fake IO and show
// a transcript, without needing a real Telegram bot or Groq key yet.
// The Netlify function backend provides a real `api` with the same shape:
// sendMessage, editMessage, deleteMessage, callGroq, httpRequest,
// resolveChain, log.

import { findChainStart } from './chains.js';

let previewMessageSeq = 0;

// В тесте «вы» (команды) — администратор, остальные — обычные участники.
export const PREVIEW_ADMIN = { id: '100000', name: 'Вы (админ)' };
export const PREVIEW_MEMBER = { id: '200000', name: 'Участник' };
const previewWarns = new Map();

function createMockModeration(onLog, onDeleteMessage) {
  const done = (text) => {
    onLog?.(`${text} (симуляция)`);
    return Promise.resolve({ ok: true });
  };
  return {
    isAdmin: async (chatId, userId) => String(userId) === PREVIEW_ADMIN.id,
    async deleteMessage(chatId, messageId) {
      onDeleteMessage?.(messageId);
      return done('сообщение удалено');
    },
    mute: (chatId, userId) => done(`мут пользователю ${userId}`),
    unmute: (chatId, userId) => done(`мут снят с пользователя ${userId}`),
    ban: (chatId, userId) => done(`бан пользователю ${userId}`),
    unban: (chatId, userId) => done(`бан снят с пользователя ${userId}`),
    kick: (chatId, userId) => done(`пользователь ${userId} удалён из чата`),
    async addWarn(chatId, userId) {
      const count = (previewWarns.get(userId) ?? 0) + 1;
      previewWarns.set(userId, count);
      return count;
    },
    async resetWarns(chatId, userId) {
      previewWarns.delete(userId);
      return true;
    }
  };
}

export const resetPreviewWarns = () => previewWarns.clear();

export function createMockApi({ onMessage, onEditMessage, onDeleteMessage, onLog, flows = [], ownChatId = 'preview' } = {}) {
  return {
    async sendMessage(chatId, { text, buttons }) {
      const id = `preview-${++previewMessageSeq}`;
      const toOtherChat = chatId !== ownChatId;
      onMessage?.({ id, text, buttons, toOtherChat, chatId });
      return id;
    },
    async editMessage(chatId, messageId, { text, buttons }) {
      const applied = onEditMessage?.(messageId, { text, buttons });
      // if the "message" no longer exists in the transcript (e.g. tester
      // hit Сброс), fall back to sending a new one, same as the real bot
      // would if Telegram said the message was gone
      return applied ? messageId : null;
    },
    async deleteMessage(chatId, messageId) {
      onDeleteMessage?.(messageId);
    },
    async callGroq({ userPrompt }) {
      // No network in preview mode — return a clearly-labeled stub so
      // testers know a real Groq call would happen here in production.
      return `[ИИ-ответ на "${userPrompt}"] (замените реальным ключом Groq для боевого запуска)`;
    },
    async httpRequest({ method, url }) {
      onLog?.(`→ ${method} ${url} (симуляция, запрос не отправлен)`);
    },
    async wait(ms) {
      onLog?.(`пауза ${ms} мс (пропущено в превью)`);
    },
    async sendChatAction() {
      onLog?.('… печатает');
    },
    moderation: createMockModeration(onLog, onDeleteMessage),
    async resolveChain(ref) {
      return findChainStart(flows, ref);
    },
    log(msg) {
      onLog?.(msg);
    }
  };
}
