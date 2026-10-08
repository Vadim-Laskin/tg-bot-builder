// Принимает события Callback API ВКонтакте для одного бота:
//   https://<site>/.netlify/functions/vk-webhook?botId=<uuid>
// (этот адрес регистрирует vk-connect.js). Тот же runFlow и те же блоки, что и
// в telegram-webhook.js — отличается только «api», которое говорит с VK.
//
// VK требует ответить ровно «ok» (или строкой подтверждения на событие
// confirmation) — иначе он будет повторять событие, поэтому на любые наши
// внутренние ошибки тоже отвечаем «ok».

import { createClient } from '@supabase/supabase-js';
import { runFlow } from '../../src/engine/flowEngine.js';
import { parseCallbackData } from '../../src/engine/buttonId.js';
import { formatPlainText } from '../../src/engine/formatText.js';
import { groupButtonsIntoRows } from '../../src/engine/buttonLayout.js';
import { buildCommonApi } from '../lib/commonApi.js';
import { vkCall } from '../lib/vkApi.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OK = { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' };
const CONVERSATION_PEER_OFFSET = 2000000000; // peer_id >= этого — беседа, меньше — личка

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return OK;

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
    .select('*, flows(*)') // * — чтобы не молчать, если колонки status ещё нет
    .eq('id', botId)
    .single();

  if (botErr || !bot || bot.platform !== 'vk' || !bot.vk_token) {
    console.error('vk-webhook: bot not found or is not a VK bot', botErr?.message);
    return OK;
  }

  // Подтверждение адреса сервера: отвечаем строкой, которую выдаёт сам VK.
  if (update.type === 'confirmation') {
    // сервер подключён вручную — строку подтверждения человек сохранил сам (ключу сообщества
    // ВК иногда не разрешает читать её через API)
    if (bot.vk_confirmation) {
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: bot.vk_confirmation.trim() };
    }
    const res = await vkCall('groups.getCallbackConfirmationCode', { group_id: bot.vk_group_id }, bot.vk_token);
    const code = res.response?.code;
    if (!code) {
      console.error('vk-webhook: no confirmation code —', res.error?.error_msg, '(сохраните строку подтверждения вручную в «Ключах бота»)');
      return { statusCode: 500, body: 'no confirmation code' };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: String(code) };
  }

  // админ заморозил или отключил бота — молчим (подтверждение адреса выше при этом работает)
  if (bot.status && bot.status !== 'active') {
    console.log(`vk-webhook: bot ${botId} is ${bot.status}, ignoring update`);
    return OK;
  }

  if (bot.vk_secret && update.secret !== bot.vk_secret) {
    console.error('vk-webhook: wrong secret, ignoring');
    return OK;
  }
  if (String(update.group_id) !== String(bot.vk_group_id)) return OK;

  if (update.type === 'message_new' || update.type === 'message_event') {
    try {
      await handleUpdate(bot, update);
    } catch (e) {
      console.error('vk-webhook error:', e);
    }
  }
  return OK;
};

async function handleUpdate(bot, update) {
  const botId = bot.id;
  const isButtonEvent = update.type === 'message_event';
  const obj = update.object ?? {};
  // в старых версиях Callback API сообщение лежит прямо в object
  const msg = isButtonEvent ? obj : obj.message ?? obj;

  const peerId = Number(msg.peer_id);
  const fromId = Number(isButtonEvent ? obj.user_id : msg.from_id);
  if (!peerId || !(fromId > 0)) return; // сообщения от сообществ и служебные — не наши
  const chatId = String(peerId);
  const isConversation = peerId >= CONVERSATION_PEER_OFFSET;

  const pending = []; // фоновые записи (лог, ответ на нажатие) — дождёмся их в конце
  const vk = (method, params) => vkCall(method, params, bot.vk_token);

  // Сразу гасим «крутилку» на нажатой кнопке — иначе VK показывает её несколько секунд
  if (isButtonEvent) {
    pending.push(vk('messages.sendMessageEventAnswer', { event_id: obj.event_id, user_id: fromId, peer_id: peerId }));
  }

  if (isConversation) {
    const { data: existingChat } = await supabaseAdmin
      .from('bot_chats')
      .select('is_enabled')
      .eq('bot_id', botId)
      .eq('chat_id', chatId)
      .maybeSingle();

    await supabaseAdmin.from('bot_chats').upsert({
      bot_id: botId,
      chat_id: chatId,
      title: `Беседа ${peerId - CONVERSATION_PEER_OFFSET}`,
      type: 'group',
      is_enabled: existingChat?.is_enabled ?? true,
      last_seen_at: new Date().toISOString()
    });
    if (existingChat && !existingChat.is_enabled) return;
  }

  const { data: stateRow } = await supabaseAdmin
    .from('chat_state')
    .select('*')
    .eq('bot_id', botId)
    .eq('chat_id', chatId)
    .maybeSingle();

  // VK повторяет событие, если не получил «ok» вовремя — второй раз не отвечаем
  if (update.event_id && stateRow?.last_event_id === update.event_id) return;

  const text = isButtonEvent ? '' : msg.text ?? '';
  const payload = isButtonEvent ? obj.payload : parsePayload(msg.payload);

  const logIn = (t) => pending.push(logMessage(botId, chatId, 'in', t));
  if (isButtonEvent) logIn('▸ (кнопка)');
  else if (payload?.c && text) logIn(`▸ ${text}`);
  else if (text) logIn(text);

  let trigger;
  let implicitStart = false;
  let quickReplyText;
  let capturedReply;

  if (typeof payload?.c === 'string') {
    // нажатие кнопки: inline-callback или текстовая кнопка клавиатуры — в обоих
    // случаях в payload лежит «блок::кнопка», как callback_data в Telegram
    const parsed = parseCallbackData(payload.c);
    if (!parsed) {
      console.error('vk-webhook: unrecognized payload', payload.c);
      await Promise.allSettled(pending);
      return;
    }
    const quickReplyMatch = /^c(\d+)$/.exec(parsed.buttonId);
    if (quickReplyMatch) {
      const choices = stateRow?.pending_choices?.[parsed.nodeId] ?? [];
      quickReplyText = choices[Number(quickReplyMatch[1])];
      if (quickReplyText === undefined) {
        console.error('vk-webhook: stale AI quick-reply button', payload.c);
        await Promise.allSettled(pending);
        return;
      }
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: 'default' };
    } else {
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: `btn-${parsed.buttonId}` };
    }
  } else if (text && stateRow?.pending_capture) {
    capturedReply = stateRow.pending_capture;
    trigger = { type: 'resume', nodeId: capturedReply.nodeId, handle: 'default' };
  } else if (
    payload?.command === 'start' ||
    /^(\/start|начать)$/i.test(text.trim()) ||
    (!stateRow && !isConversation && !text.startsWith('/'))
  ) {
    // у VK нет /start — его роль играет кнопка «Начать» в новом диалоге с сообществом.
    // А если человек просто написал первое сообщение, не нажав «Начать», считаем это тем же
    // самым: иначе бот молчал бы, пока пользователь не угадает нужное слово.
    implicitStart = !(payload?.command === 'start' || /^(\/start|начать)$/i.test(text.trim()));
    trigger = { type: 'command', value: '/start' };
  } else if (text.startsWith('/')) {
    trigger = { type: 'command', value: text.split(' ')[0] };
  } else if (text && stateRow?.pending_keyboard?.[text]) {
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
    // «сообщения» во ВКонтакте адресуются номером внутри беседы (conversation_message_id)
    sourceMessageId: isButtonEvent ? obj.conversation_message_id : undefined,
    incomingMessageId: isButtonEvent ? undefined : msg.conversation_message_id,
    chatType: isConversation ? 'group' : 'private'
  };

  if (capturedReply) {
    const bag = capturedReply.scope === 'global' ? context.globalVariables : context.variables;
    bag[capturedReply.variableName] = text;
  }

  const mainFlow = bot.flows.find((f) => f.is_main) ?? bot.flows[0];
  if (!mainFlow) {
    await Promise.allSettled(pending);
    return;
  }
  // «Начать» / первое сообщение / /start, но события «Команда /start» в сценарии нет —
  // тогда это обычный текст (пусть сработает событие «Любой текст», если оно есть)
  const events = (mainFlow.graph?.nodes ?? []).filter((n) => n.type === 'event').map((n) => `${n.data?.triggerType}:${n.data?.value ?? ''}`);
  if (trigger.type === 'command' && trigger.value === '/start') {
    const hasStart = (mainFlow.graph?.nodes ?? []).some(
      (n) =>
        n.type === 'event' &&
        n.data?.triggerType === 'command' &&
        String(n.data?.value ?? '').trim().toLowerCase().replace(/^\/?/, '/') === '/start'
    );
    if (!hasStart) trigger = { type: 'text', value: text };
  }

  console.log(
    `vk-webhook: ${update.type} peer=${peerId} trigger=${JSON.stringify(trigger)} text=${JSON.stringify(text.slice(0, 60))} события_в_сценарии=${JSON.stringify(events)}`
  );

  const runFlowSource =
    trigger.type === 'resume'
      ? bot.flows.find((f) => f.graph?.nodes?.some((n) => n.id === trigger.nodeId)) ?? mainFlow
      : mainFlow;

  const api = {
    ...buildVkApi({ vk, botId, pending }),
    ...buildCommonApi({ groqApiKey: bot.groq_api_key, flows: bot.flows }),
    // попадает в Netlify → Logs → Functions: видно, почему сценарий «молчит»
    log: (m) => console.log('[flow]', m)
  };

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

  // имя собеседника для списка «Пользователи» — спрашиваем один раз
  let displayName = stateRow?.display_name ?? null;
  let username = stateRow?.username ?? null;
  if (!displayName) {
    if (isConversation) {
      displayName = `Беседа ${peerId - CONVERSATION_PEER_OFFSET}`;
    } else {
      const res = await vk('users.get', { user_ids: fromId, fields: 'screen_name' });
      const u = res.response?.[0];
      if (u) {
        displayName = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
        username = u.screen_name || null;
      }
    }
  }

  await supabaseAdmin.from('chat_state').upsert({
    bot_id: botId,
    chat_id: chatId,
    variables: context.variables,
    tags: context.tags,
    message_ids: context.messageIds,
    pending_choices: context.pendingChoices,
    pending_keyboard: context.pendingKeyboard ?? {},
    pending_capture: context.pendingCapture ?? null,
    display_name: displayName,
    username,
    chat_type: isConversation ? 'group' : 'private',
    last_event_id: update.event_id ?? null,
    updated_at: new Date().toISOString()
  });

  await supabaseAdmin
    .from('bots')
    .update({ global_variables: context.globalVariables, global_tags: context.globalTags })
    .eq('id', botId);

  await Promise.allSettled(pending);
}

function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function logMessage(botId, chatId, direction, text) {
  if (!text) return Promise.resolve();
  return supabaseAdmin
    .from('chat_messages')
    .insert({ bot_id: botId, chat_id: chatId, direction, text })
    .then(
      () => {},
      (e) => console.error('chat_messages log failed:', e.message)
    );
}

// ---- клавиатуры VK ----
// Лимиты VK: на строку до 5 кнопок (у обычной клавиатуры — 4), строк до 6 у
// inline и до 10 у обычной; подпись до 40 символов; payload до 255 символов.
// Цвета кнопок те же четыре, что и в редакторе.
const VK_COLORS = { primary: 'primary', success: 'positive', danger: 'negative' };

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function buildKeyboard(buttons, layout) {
  if (!buttons?.length) return undefined;
  const inline = layout !== 'keyboard';
  const rows = groupButtonsIntoRows(buttons)
    .flatMap((row) => chunk(row, inline ? 5 : 4))
    .slice(0, inline ? 6 : 10);

  const keyboard = {
    inline,
    buttons: rows.map((row) =>
      row.map((b) => {
        const label = String(b.text || '…').slice(0, 40);
        if (b.kind === 'url') {
          return { action: { type: 'open_link', link: b.url || 'https://vk.com', label } };
        }
        const payload = JSON.stringify({ c: b.callbackData });
        return {
          action: { type: inline ? 'callback' : 'text', label, payload },
          color: VK_COLORS[b.style] || 'secondary'
        };
      })
    )
  };
  if (!inline) keyboard.one_time = false;
  return JSON.stringify(keyboard);
}

const EMPTY_INLINE_KEYBOARD = JSON.stringify({ inline: true, buttons: [] });
const randomId = () => Math.floor(Math.random() * 2147483647);

function buildVkApi({ vk, botId, pending }) {
  return {
    async sendMessage(chatId, { text, buttons, buttonsLayout }) {
      const message = formatPlainText(text).slice(0, 4096) || '…';
      const keyboard = buildKeyboard(buttons, buttonsLayout);

      let res = await vk('messages.send', { peer_ids: chatId, random_id: randomId(), message, keyboard });
      if (res.error && keyboard) {
        // кривая клавиатура не должна съедать само сообщение
        console.error('messages.send with keyboard failed, retrying without it:', res.error.error_msg);
        res = await vk('messages.send', { peer_ids: chatId, random_id: randomId(), message });
      }

      const item = Array.isArray(res.response) ? res.response[0] : null;
      if (!item || item.error) {
        console.error('messages.send failed:', res.error?.error_msg ?? item?.error?.description ?? item?.error);
        return null;
      }
      pending.push(logMessage(botId, chatId, 'out', text));
      return item.conversation_message_id ?? item.message_id;
    },

    // «Редактировать предыдущее сообщение»: у VK правка работает по номеру
    // сообщения в беседе и только в течение суток. null — не вышло, движок
    // тогда просто отправит новое.
    async editMessage(chatId, messageId, { text, buttons }) {
      if (!messageId) return null;
      const res = await vk('messages.edit', {
        peer_id: chatId,
        conversation_message_id: messageId,
        message: formatPlainText(text).slice(0, 4096) || '…',
        keyboard: buildKeyboard(buttons, 'inline') ?? EMPTY_INLINE_KEYBOARD,
        keep_forward_messages: 1
      });
      if (res.error) {
        console.error('messages.edit failed, will fall back to send:', res.error.error_msg);
        return null;
      }
      pending.push(logMessage(botId, chatId, 'out', text));
      return messageId;
    },

    async deleteMessage(chatId, messageId) {
      if (!messageId) return;
      const res = await vk('messages.delete', { peer_id: chatId, cmids: messageId, delete_for_all: 1 });
      if (res.error) console.error('messages.delete failed:', res.error.error_msg);
    },

    async sendChatAction(chatId) {
      await vk('messages.setActivity', { peer_id: chatId, type: 'typing' });
    }
  };
}
