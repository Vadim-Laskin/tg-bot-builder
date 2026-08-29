// Used by the in-editor "Тест" panel to run a flow against fake IO and show
// a transcript, without needing a real Telegram bot or Groq key yet.
// The Netlify function backend (phase 2) will provide a real `api` with the
// same shape: sendMessage, callGroq, httpRequest, resolveChain, log.

export function createMockApi({ onMessage, onLog, flows = [] } = {}) {
  return {
    async sendMessage(chatId, { text, buttons }) {
      onMessage?.({ text, buttons });
    },
    async callGroq({ systemPrompt, userPrompt }) {
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
