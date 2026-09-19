// Used by the in-editor "Тест" panel to run a flow against fake IO and show
// a transcript, without needing a real Telegram bot or Groq key yet.
// The Netlify function backend provides a real `api` with the same shape:
// sendMessage, editMessage, deleteMessage, callGroq, httpRequest,
// resolveChain, log.

let previewMessageSeq = 0;

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
      onLog?.(`⏳ пауза ${ms} мс (пропущено в превью)`);
    },
    async sendChatAction() {
      onLog?.('… печатает');
    },
    async resolveChain(flowId) {
      const found = flows.find((f) => f.id === flowId);
      return found ? { nodes: found.nodes, edges: found.edges } : null;
    },
    log(msg) {
      onLog?.(msg);
    }
  };
}
