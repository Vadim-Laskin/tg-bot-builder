// Receives Telegram updates for one bot at:
//   https://<site>/.netlify/functions/telegram-webhook?botId=<uuid>
// (that full URL, with the query string, is what set-webhook.js registers
// with Telegram — see that file).
//
// This is the "phase 2" api implementation the engine was designed for in
// src/engine/flowEngine.js: same runFlow(), same nodeHandlers, just backed
// by real fetch() calls to Telegram + Groq instead of the browser's
// mockApi.js.

import { createClient } from '@supabase/supabase-js';
import { runFlow } from '../../src/engine/flowEngine.js';
import { parseCallbackData } from '../../src/engine/buttonId.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'ok' };
  }

  const botId = event.queryStringParameters?.botId;
  if (!botId) return { statusCode: 400, body: 'missing botId' };

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'bad json' };
  }

  const { data: bot, error: botErr } = await supabaseAdmin
    .from('bots')
    .select('id, telegram_token, groq_api_key, flows(*)')
    .eq('id', botId)
    .single();

  // Always answer 200 to Telegram even on our own errors — a non-200
  // makes Telegram retry the same update repeatedly.
  if (botErr || !bot || !bot.telegram_token) {
    console.error('webhook: bot not found or has no token', botErr?.message);
    return { statusCode: 200, body: 'ignored' };
  }

  const message = update.message ?? update.callback_query?.message;
  const chatId = message?.chat?.id;
  if (!chatId) return { statusCode: 200, body: 'no chat in update' };

  const text = update.message?.text ?? '';
  const callbackData = update.callback_query?.data;

  let trigger;
  if (callbackData) {
    // buttons made in the editor encode which block + which button they
    // are, so a press resumes the flow from exactly that point — there's
    // no separate "Событие: кнопка" matching anymore
    const parsed = parseCallbackData(callbackData);
    if (!parsed) {
      console.error('webhook: unrecognized callback_data', callbackData);
      await answerCallbackQuery(bot.telegram_token, update.callback_query.id);
      return { statusCode: 200, body: 'unrecognized callback' };
    }
    trigger = { type: 'resume', nodeId: parsed.nodeId, handle: `btn-${parsed.buttonId}` };
  } else if (text.startsWith('/')) {
    trigger = { type: 'command', value: text.split(' ')[0] };
  } else {
    trigger = { type: 'text', value: text };
  }

  const { data: stateRow } = await supabaseAdmin
    .from('chat_state')
    .select('*')
    .eq('bot_id', botId)
    .eq('chat_id', String(chatId))
    .maybeSingle();

  const context = {
    chatId,
    lastMessage: text,
    variables: stateRow?.variables ?? {},
    tags: stateRow?.tags ?? []
  };

  const mainFlow = bot.flows.find((f) => f.is_main) ?? bot.flows[0];
  if (!mainFlow) return { statusCode: 200, body: 'bot has no flow yet' };

  // a button resume needs the specific flow that node lives in — it might
  // be inside a chain (scenario), not the main flow
  const runFlowSource =
    trigger.type === 'resume'
      ? bot.flows.find((f) => f.graph?.nodes?.some((n) => n.id === trigger.nodeId)) ?? mainFlow
      : mainFlow;

  const api = buildTelegramApi({
    telegramToken: bot.telegram_token,
    groqApiKey: bot.groq_api_key,
    flows: bot.flows
  });

  try {
    await runFlow({
      graph: { nodes: runFlowSource.graph?.nodes ?? [], edges: runFlowSource.graph?.edges ?? [] },
      trigger,
      context,
      api
    });
  } catch (e) {
    console.error('flow execution error:', e);
  }

  await supabaseAdmin.from('chat_state').upsert({
    bot_id: botId,
    chat_id: String(chatId),
    variables: context.variables,
    tags: context.tags,
    updated_at: new Date().toISOString()
  });

  // stop the button's loading spinner in the Telegram client
  if (update.callback_query) {
    await answerCallbackQuery(bot.telegram_token, update.callback_query.id);
  }

  return { statusCode: 200, body: 'ok' };
};

async function answerCallbackQuery(telegramToken, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  }).catch(() => {});
}

function buildTelegramApi({ telegramToken, groqApiKey, flows }) {
  const tg = (method, payload) =>
    fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .catch((e) => console.error(`telegram ${method} failed:`, e.message));

  return {
    async sendMessage(chatId, { text, buttons }) {
      const reply_markup = buttons?.length
        ? {
            inline_keyboard: buttons.map((b) => [
              b.kind === 'url' ? { text: b.text, url: b.url || 'https://t.me' } : { text: b.text, callback_data: b.callbackData }
            ])
          }
        : undefined;
      await tg('sendMessage', { chat_id: chatId, text: text || ' ', reply_markup });
    },

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

    async sendChatAction(chatId, action) {
      await tg('sendChatAction', { chat_id: chatId, action: action || 'typing' });
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
