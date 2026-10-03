// Части `api` для движка, которые одинаковы в любом мессенджере: ИИ (Groq),
// HTTP-запросы из блока «Действие», пауза и поиск цепочек. Telegram- и
// VK-вебхуки добавляют сюда свои sendMessage/editMessage/deleteMessage.

export function buildCommonApi({ groqApiKey, flows }) {
  return {
    async callGroq({ model, systemPrompt, userPrompt }) {
      if (!groqApiKey) return 'Groq API-ключ не задан для этого бота (Ключи бота → Groq API Key).';
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqApiKey}` },
          body: JSON.stringify({
            model: resolveGroqModel(model),
            messages: [
              { role: 'system', content: systemPrompt || '' },
              { role: 'user', content: userPrompt || '' }
            ]
          })
        });
        const data = await res.json();
        if (data.error) {
          console.error('groq error:', data.error.message);
          return 'Не удалось получить ответ от ИИ (проверьте Groq API Key).';
        }
        return data.choices?.[0]?.message?.content ?? '(пустой ответ от ИИ)';
      } catch (e) {
        console.error('groq call failed:', e.message);
        return 'Не удалось получить ответ от ИИ.';
      }
    },

    async httpRequest({ method, url, body }) {
      if (!url) return;
      try {
        await fetch(url, {
          method: method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: (method || 'POST') === 'GET' ? undefined : body
        });
      } catch (e) {
        console.error('action http request failed:', e.message);
      }
    },

    async wait(ms) {
      // capped so one runaway "Действие → Пауза" block can't eat the
      // whole function timeout
      await new Promise((r) => setTimeout(r, Math.min(Number(ms) || 0, 4000)));
    },

    async resolveChain(flowId) {
      const f = flows.find((fl) => fl.id === flowId);
      return f ? { nodes: f.graph?.nodes ?? [], edges: f.graph?.edges ?? [] } : null;
    },

    log(msg) {
      console.log(msg);
    }
  };
}

// Groq retires models fairly often. Flows saved before a retirement would
// otherwise silently break, so known-dead ids get remapped to a current
// equivalent here — one place to update when Groq deprecates the next one.
// See https://console.groq.com/docs/deprecations
const GROQ_MODEL_REPLACEMENTS = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'mixtral-8x7b-32768': 'openai/gpt-oss-120b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'qwen/qwen3.6-27b'
};

function resolveGroqModel(model) {
  return GROQ_MODEL_REPLACEMENTS[model] || model || 'openai/gpt-oss-120b';
}
