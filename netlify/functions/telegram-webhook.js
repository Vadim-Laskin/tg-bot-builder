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
import { formatMessageText } from '../../src/engine/formatText.js';
import { groupButtonsIntoRows } from '../../src/engine/buttonLayout.js';
import { buildCommonApi } from '../lib/commonApi.js';
import { buildTelegramModeration } from '../lib/telegramModeration.js';
import { findViolation, safeName } from '../../src/engine/moderation.js';

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
    .select('*, flows(*)') // * — чтобы не молчать, если колонки status ещё нет (схема не обновлена)
    .eq('id', botId)
    .single();

  // Always answer 200 to Telegram even on our own errors — a non-200
  // makes Telegram retry the same update repeatedly.
  if (botErr || !bot || !bot.telegram_token) {
    console.error('webhook: bot not found or has no token', botErr?.message);
    return { statusCode: 200, body: 'ignored' };
  }

  // админ заморозил или отключил бота — молчим (200, чтобы Telegram не повторял апдейт)
  if (bot.status && bot.status !== 'active') {
    console.log(`webhook: bot ${botId} is ${bot.status}, ignoring update`);
    return { statusCode: 200, body: 'bot is not active' };
  }

  // channel posts arrive as their own update type, not as `message` —
  // easy to miss, since everything else (groups, private chats) uses `message`
  const message =
    update.message ?? update.callback_query?.message ?? update.channel_post ?? update.edited_channel_post ?? update.edited_message;
  const chatId = message?.chat?.id;
  if (!chatId) return { statusCode: 200, body: 'no chat in update' };

  const chat = message.chat;
  if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
    const { data: existingChat } = await supabaseAdmin
      .from('bot_chats')
      .select('is_enabled')
      .eq('bot_id', botId)
      .eq('chat_id', String(chatId))
      .maybeSingle();

    await supabaseAdmin.from('bot_chats').upsert({
      bot_id: botId,
      chat_id: String(chatId),
      title: chat.title || '',
      type: chat.type,
      is_enabled: existingChat?.is_enabled ?? true, // preserve an existing owner-set toggle
      last_seen_at: new Date().toISOString()
    });

    if (existingChat && !existingChat.is_enabled) {
      return { statusCode: 200, body: 'bot disabled in this chat' };
    }
  }

  const text =
    update.message?.text ?? update.channel_post?.text ?? update.edited_message?.text ?? update.edited_message?.caption ?? '';
  const callbackData = update.callback_query?.data;

  if (callbackData) {
    const label = findPressedButtonText(update.callback_query) || '(кнопка)';
    logMessage(botId, chatId, 'in', `▸ ${label}`);
  } else if (text && !update.edited_message) {
    logMessage(botId, chatId, 'in', text);
  }

  const { data: stateRow } = await supabaseAdmin
    .from('chat_state')
    .select('*')
    .eq('bot_id', botId)
    .eq('chat_id', String(chatId))
    .maybeSingle();

  const mainFlow = bot.flows.find((f) => f.is_main) ?? bot.flows[0];
  if (!mainFlow) return { statusCode: 200, body: 'bot has no flow yet' };

  const api = buildTelegramApi({
    telegramToken: bot.telegram_token,
    groqApiKey: bot.groq_api_key,
    flows: bot.flows,
    botId
  });

  // Модерация: каждое сообщение (и его правку) от участника группы проверяем раньше
  // всего остального — иначе нарушение можно было бы спрятать в команду или ответ боту.
  const violation = await checkViolation(update, mainFlow, api);
  // правки сообщений нужны только модератору, сценарий они не запускают
  if (update.edited_message && !violation) return { statusCode: 200, body: 'edited message' };

  let trigger;
  let quickReplyText; // set when the pressed button is an AI-generated quick reply
  let capturedReply; // set when this message fills a "wait for reply" capture
  if (violation) {
    trigger = { type: 'violation', nodeId: violation.node.id };
  } else if (callbackData) {
    // buttons made in the editor encode which block + which button they
    // are, so a press resumes the flow from exactly that point — there's
    // no separate "Событие: кнопка" matching anymore
    const parsed = parseCallbackData(callbackData);
    if (!parsed) {
      console.error('webhook: unrecognized callback_data', callbackData);
      await answerCallbackQuery(bot.telegram_token, update.callback_query.id);
      return { statusCode: 200, body: 'unrecognized callback' };
    }

    const quickReplyMatch = /^c(\d+)$/.exec(parsed.buttonId);
    if (quickReplyMatch) {
      // an AI "Сообщение с ИИ" quick-reply button — not a graph edge, so
      // resume from that block's normal output instead of a button handle,
      // with lastMessage set to whichever option was picked
      const choices = stateRow?.pending_choices?.[parsed.nodeId] ?? [];
      quickReplyText = choices[Number(quickReplyMatch[1])];
      if (quickReplyText === undefined) {
        console.error('webhook: stale AI quick-reply button', callbackData);
        await answerCallbackQuery(bot.telegram_token, update.callback_query.id);
        return { statusCode: 200, body: 'stale quick reply' };
      }
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: 'default' };
    } else {
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: `btn-${parsed.buttonId}` };
    }
  } else if (text && stateRow?.pending_capture) {
    // "Ждать ответ пользователя" on a Сообщение block — whatever the user
    // sends next fills that variable, even if it looks like a command
    const cap = stateRow.pending_capture;
    capturedReply = cap;
    trigger = { type: 'resume', nodeId: cap.nodeId, handle: 'default' };
  } else if (text.startsWith('/')) {
    // в группах команды приходят как «/ban@имя_бота»; чужие команды не наши
    const [command, addressee] = text.split(/\s+/)[0].split('@');
    if (addressee && !(await isOwnUsername(bot.telegram_token, addressee))) {
      return { statusCode: 200, body: 'command for another bot' };
    }
    trigger = { type: 'command', value: command };
  } else if (text && stateRow?.pending_keyboard?.[text]) {
    // a reply-keyboard button (под полем ввода) — Telegram gives no
    // metadata back for these, just the button's own text, so matching
    // against what we last sent is the only way to tell it apart from the
    // user just having typed the same words themselves
    const target = stateRow.pending_keyboard[text];
    trigger = { type: 'resume', nodeId: target.nodeId, handle: `btn-${target.buttonId}` };
  } else {
    trigger = { type: 'text', value: text };
  }

  const context = {
    chatId,
    lastMessage: quickReplyText ?? text,
    variables: stateRow?.variables ?? {},
    tags: stateRow?.tags ?? [],
    messageIds: stateRow?.message_ids ?? {},
    pendingChoices: stateRow?.pending_choices ?? {},
    pendingKeyboard: stateRow?.pending_keyboard ?? {},
    globalVariables: bot.global_variables ?? {},
    globalTags: bot.global_tags ?? [],
    // only set for a button press — the message that button lives on, so
    // an "edit previous message" block knows what to edit. Absent for
    // /start or plain-text triggers, since there's nothing to edit yet.
    sourceMessageId: update.callback_query?.message?.message_id,
    ...describeSender(update, message),
    // нарушение не должно сбрасывать ожидание ответа от другого участника
    pendingCapture: violation ? stateRow?.pending_capture ?? undefined : undefined,
    // the user's own incoming message that triggered this run (unset for
    // button presses, resumes, or channel posts with no author message) —
    // used by Действие → "Удалить сообщение пользователя"
    incomingMessageId: (update.message ?? update.edited_message)?.message_id,
    // 'private' | 'group' | 'supergroup' | 'channel' — used by the
    // "источник сообщения" condition operator
    chatType: message?.chat?.type
  };

  context.builtins = {
    sender_name: safeName(context.sender?.name),
    sender_id: context.sender?.id ?? '',
    command_args: trigger.type === 'command' ? text.replace(/^\S+\s*/, '') : '',
    violation_reason: violation?.reason ?? ''
  };
  if (violation) context.lastMessage = update.message?.text ?? update.edited_message?.text ?? update.message?.caption ?? '';

  if (capturedReply) {
    const bag = capturedReply.scope === 'global' ? context.globalVariables : context.variables;
    bag[capturedReply.variableName] = text;
  }

  // a button resume needs the specific flow that node lives in — it might
  // be inside a chain (scenario), not the main flow
  const runFlowSource =
    trigger.type === 'resume'
      ? bot.flows.find((f) => f.graph?.nodes?.some((n) => n.id === trigger.nodeId)) ?? mainFlow
      : mainFlow;

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
    message_ids: context.messageIds,
    pending_choices: context.pendingChoices,
    pending_keyboard: context.pendingKeyboard ?? {},
    pending_capture: context.pendingCapture ?? null,
    display_name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || null,
    username: chat.username || null,
    chat_type: chat.type,
    updated_at: new Date().toISOString()
  });

  // global variables/tags are bot-wide, not per-chat, so they go on the
  // bots row instead of chat_state
  await supabaseAdmin
    .from('bots')
    .update({ global_variables: context.globalVariables, global_tags: context.globalTags })
    .eq('id', botId);

  // stop the button's loading spinner in the Telegram client
  if (update.callback_query) {
    await answerCallbackQuery(bot.telegram_token, update.callback_query.id);
  }

  return { statusCode: 200, body: 'ok' };
};

// Проверка сообщения участника событиями «Проверка сообщений» основного сценария.
async function checkViolation(update, mainFlow, api) {
  const msg = update.message ?? update.edited_message;
  if (!msg || (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup')) return null;
  // анонимные администраторы и посты привязанного канала — не участники
  if (msg.is_automatic_forward || msg.sender_chat?.id === msg.chat.id) return null;
  if (msg.from?.is_bot && !msg.sender_chat) return null;

  try {
    const found = await findViolation({
      graph: mainFlow.graph,
      text: msg.text ?? msg.caption ?? '',
      entities: msg.entities ?? msg.caption_entities,
      api
    });
    if (!found) return null;
    // права спрашиваем только когда нарушение найдено — чтобы не дёргать Telegram на каждое сообщение
    const ignoreAdmins = found.node.data.ignoreAdmins ?? true;
    if (ignoreAdmins && !msg.sender_chat && (await api.moderation.isAdmin(msg.chat.id, msg.from.id))) return null;
    return found;
  } catch (e) {
    console.error('moderation check failed:', e);
    return null;
  }
}

// Кто запустил сценарий и на чьё сообщение он ответил.
function describeSender(update, message) {
  const person = (msg, from) => {
    if (msg?.sender_chat && msg.sender_chat.id !== msg.chat.id) {
      return { id: msg.sender_chat.id, name: msg.sender_chat.title, isChat: true };
    }
    if (msg?.sender_chat || !from) return undefined;
    return { id: from.id, name: [from.first_name, from.last_name].filter(Boolean).join(' ') };
  };

  // у нажатой кнопки message — это сообщение бота, а действует нажавший
  if (update.callback_query) return { sender: person(null, update.callback_query.from) };
  if (!update.message && !update.edited_message) return {};

  const reply = message.reply_to_message;
  return {
    sender: person(message, message.from),
    senderIsAnonymousAdmin: message.sender_chat?.id === message.chat.id,
    // в темах форума «ответом» числится и служебное сообщение о создании темы
    replyTo:
      reply && !reply.forum_topic_created
        ? { messageId: reply.message_id, sender: person(reply, reply.from) }
        : undefined
  };
}

async function isOwnUsername(telegramToken, username) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`);
    const data = await res.json();
    return !data.ok || data.result.username?.toLowerCase() === username.toLowerCase();
  } catch {
    return true;
  }
}

async function answerCallbackQuery(telegramToken, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${telegramToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  }).catch(() => {});
}

// Best-effort, fire-and-forget — a logging hiccup should never break the
// bot's actual reply, so this is never awaited by its callers.
function logMessage(botId, chatId, direction, text) {
  if (!text) return;
  supabaseAdmin
    .from('chat_messages')
    .insert({ bot_id: botId, chat_id: String(chatId), direction, text })
    .then(
      () => {},
      (e) => console.error('chat_messages log failed:', e.message)
    );
}

// Telegram includes the message's own reply_markup back in callback_query,
// so the pressed button's label can be recovered for the history log.
function findPressedButtonText(callbackQuery) {
  const rows = callbackQuery?.message?.reply_markup?.inline_keyboard ?? [];
  for (const row of rows) {
    for (const btn of row) {
      if (btn.callback_data === callbackQuery.data) return btn.text;
    }
  }
  return null;
}

function buildReplyMarkup(buttons, buttonsLayout) {
  if (!buttons?.length) return undefined;
  const rows = groupButtonsIntoRows(buttons);
  if (buttonsLayout === 'keyboard') {
    // reply keyboard: Telegram sends back only the button's plain text,
    // no metadata — that's what pending_keyboard above is for
    return {
      keyboard: rows.map((row) => row.map((b) => ({ text: b.text, style: b.style || undefined }))),
      resize_keyboard: true
    };
  }
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) => ({
        text: b.text,
        style: b.style || undefined,
        ...(b.kind === 'url' ? { url: b.url || 'https://t.me' } : { callback_data: b.callbackData })
      }))
    )
  };
}

function buildTelegramApi({ telegramToken, groqApiKey, flows, botId }) {
  const tg = (method, payload) =>
    fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .catch((e) => console.error(`telegram ${method} failed:`, e.message));

  return {
    async sendMessage(chatId, { text, buttons, buttonsLayout }) {
      const reply_markup = buildReplyMarkup(buttons, buttonsLayout);
      const result = await tg('sendMessage', {
        chat_id: chatId,
        text: formatMessageText(text) || ' ',
        parse_mode: 'HTML',
        reply_markup
      });
      if (!result?.ok) {
        console.error('sendMessage failed:', result?.description);
        return null;
      }
      logMessage(botId, chatId, 'out', text);
      return result.result.message_id;
    },

    // Used by "Редактировать предыдущее сообщение" — edits a message in
    // place (Telegram keeps the same message_id) instead of sending a new
    // one. Returns null on failure so the caller can fall back to
    // sendMessage (e.g. the message is too old, or was already deleted).
    // Telegram's editMessageText only accepts an inline keyboard, never a
    // reply keyboard — nodeHandlers.js already avoids calling this for
    // keyboard-layout messages, so buttons here are always inline.
    async editMessage(chatId, messageId, { text, buttons }) {
      if (!messageId) return null;
      const result = await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: formatMessageText(text) || ' ',
        parse_mode: 'HTML',
        reply_markup: buildReplyMarkup(buttons, 'inline')
      });
      if (!result?.ok) {
        console.error('editMessage failed, will fall back to sendMessage:', result?.description);
        return null;
      }
      logMessage(botId, chatId, 'out', text);
      return messageId;
    },

    // Used by the Действие → "Удалить сообщение" block.
    async deleteMessage(chatId, messageId) {
      if (!messageId) return;
      const result = await tg('deleteMessage', { chat_id: chatId, message_id: messageId });
      if (!result?.ok) {
        console.error('deleteMessage failed (message may be too old or already gone):', result?.description);
      }
    },

    async sendChatAction(chatId, action) {
      await tg('sendChatAction', { chat_id: chatId, action: action || 'typing' });
    },

    moderation: buildTelegramModeration({ tg, supabase: supabaseAdmin, botId }),

    ...buildCommonApi({ groqApiKey, flows })
  };
}
