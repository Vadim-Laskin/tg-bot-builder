// Each handler receives (node, context, api) and may:
//  - mutate `context` (variables, tags)
//  - call methods on `api` (sendMessage, callGroq, httpRequest...)
//  - return { next: 'default' | 'true' | 'false' | 'stop' } to steer the walk
//
// `api` is injected by whoever runs the engine (see flowEngine.js header).

import { interpolate } from './flowEngine.js';
import { getButtonId, buildCallbackData } from './buttonId.js';
import { extractUrls, fetchUrlContent } from './webContent.js';

const handlers = {
  note: async () => ({ next: 'default' }), // visual only, no-op at runtime

  event: async () => ({ next: 'default' }), // entry point, nothing to execute itself

  message: async (node, context, api) => {
    const text = interpolate(node.data.text, context);
    const layout = resolveButtonsLayout(node.data.buttonsLayout, context);
    const rawButtons = node.data.buttons ?? [];
    const buttons = buildButtons(node.id, rawButtons, layout, context);

    const messageId = await sendOrEditMessage(node, context, api, { text, buttons, buttonsLayout: layout });
    rememberMessageId(context, node.id, messageId);

    // Any buttons (inline callback OR keyboard) mean the flow should pause
    // and wait for a press — it resumes later from that specific button's
    // handle (see flowEngine.js's `resume` trigger), not by continuing on.
    const waitsForPress = layout === 'keyboard' ? rawButtons.length > 0 : buttons.some((b) => b.kind === 'callback');
    return { next: waitsForPress ? 'stop' : 'default' };
  },

  // Fire-and-forget by design: sends to a DIFFERENT chat than the one
  // currently running this flow, so it never pauses the current run even
  // if it has buttons — those buttons work normally, but as their own
  // independent resume when someone in the target chat presses one.
  sendToChat: async (node, context, api) => {
    const targetChatId = resolveTargetChatId(node.data, context);
    if (!targetChatId) {
      api.log?.('Отправить в чат: получатель не определён (проверьте настройки блока).');
      return { next: 'default' };
    }

    const text = interpolate(node.data.text, context);
    // targetType 'group' is forced to inline in the editor already; for
    // user/variable/manual we trust whatever layout was configured
    const layout = node.data.targetType === 'group' ? 'inline' : node.data.buttonsLayout || 'inline';
    const buttons = buildButtons(node.id, node.data.buttons ?? [], layout, context);

    await api.sendMessage(targetChatId, { text, buttons, buttonsLayout: layout });
    return { next: 'default' };
  },

  aiMessage: async (node, context, api) => {
    const prompt = interpolate(node.data.userPrompt, context);

    // if the prompt contains a link, fetch it and hand the AI its content —
    // no separate toggle needed, this is a no-op whenever there's no URL
    let promptWithLinks = prompt;
    const urls = extractUrls(prompt);
    if (urls.length) {
      const pages = await Promise.all(
        urls.map(async (url) => `Содержимое ${url}:\n${await fetchUrlContent(url)}`)
      );
      promptWithLinks = `${prompt}\n\n${pages.join('\n\n')}`;
    }

    let systemPrompt = node.data.systemPrompt;
    if (node.data.allowButtons) {
      systemPrompt = `${systemPrompt || ''}\n\nЕсли уместно предложить пользователю короткие варианты ответа, заверши свой ответ ОТДЕЛЬНОЙ строкой строго в виде:\nBUTTONS: Вариант 1 | Вариант 2 | Вариант 3\n(не больше 4 вариантов, каждый до 30 символов, через " | "). Если варианты не нужны — не добавляй такую строку вообще.`;
    }

    const rawReply = await api.callGroq({ model: node.data.model, systemPrompt, userPrompt: promptWithLinks });
    const { text: reply, labels } = node.data.allowButtons ? splitQuickReplyButtons(rawReply) : { text: rawReply, labels: [] };

    if (node.data.saveTo) context.variables[node.data.saveTo] = reply;

    const buttons = labels.map((label, i) => ({
      text: label,
      kind: 'callback',
      callbackData: buildCallbackData(node.id, `c${i}`)
    }));
    if (buttons.length) {
      context.pendingChoices = context.pendingChoices || {};
      context.pendingChoices[node.id] = labels;
    }

    const messageId = await sendOrEditMessage(node, context, api, { text: reply, buttons, buttonsLayout: 'inline' });
    rememberMessageId(context, node.id, messageId);

    // like a Сообщение block with callback buttons: pause for the pick
    return { next: buttons.length ? 'stop' : 'default' };
  },

  action: async (node, context, api) => {
    if (node.data.actionType === 'http') {
      await api.httpRequest({
        method: node.data.method ?? 'POST',
        url: interpolate(node.data.url, context),
        body: interpolate(node.data.body, context)
      });
    } else if (node.data.actionType === 'delay') {
      await api.wait?.(Number(node.data.value) || 0);
    } else if (node.data.actionType === 'typing') {
      await api.sendChatAction?.(context.chatId, 'typing');
    } else if (node.data.actionType === 'deleteMessage') {
      const messageId = context.messageIds?.[node.data.targetNodeId];
      if (messageId) {
        await api.deleteMessage?.(context.chatId, messageId);
      } else {
        api.log?.('Удалить сообщение: для этого чата у выбранного блока ещё нет отправленного сообщения.');
      }
    }
    return { next: 'default' };
  },

  condition: async (node, context) => {
    const { operator, value, variableName, tagName, scope } = node.data;

    if (operator === 'chatType') {
      const actual = context.chatType === 'private' ? 'private' : 'group'; // supergroup counts as group
      return { next: actual === (value || 'private') ? 'true' : 'false' };
    }

    if (operator === 'hasTag' || operator === 'notHasTag') {
      if (!tagName) return { next: 'false' };
      const list = (scope === 'global' ? context.globalTags : context.tags) ?? [];
      const has = list.includes(tagName);
      return { next: (operator === 'hasTag' ? has : !has) ? 'true' : 'false' };
    }

    if (!variableName) return { next: 'false' };
    const bag = (scope === 'global' ? context.globalVariables : context.variables) ?? {};
    const passed = evaluateCondition(bag[variableName], operator, value);
    return { next: passed ? 'true' : 'false' };
  },

  chain: async (node, context, api) => {
    const subGraph = await api.resolveChain?.(node.data.flowId);
    if (!subGraph) {
      api.log?.(`Цепочка не найдена: ${node.data.flowId}`);
      return { next: 'default' };
    }
    const { runFlow } = await import('./flowEngine.js');
    await runFlow({
      graph: subGraph,
      trigger: { type: 'command', value: '__chain_entry__' },
      context,
      api
    });
    return { next: 'default' };
  },

  setVariable: async (node, context) => {
    const { variableName, scope, op, value } = node.data;
    if (!variableName) return { next: 'default' };
    if (scope === 'global') context.globalVariables = context.globalVariables || {};
    const bag = scope === 'global' ? context.globalVariables : context.variables;
    const rendered = interpolate(value, context);
    if (op === 'clear') delete bag[variableName];
    else if (op === 'increment') {
      bag[variableName] = (Number(bag[variableName]) || 0) + (Number(rendered) || 1);
    } else {
      bag[variableName] = rendered;
    }
    return { next: 'default' };
  },

  setTag: async (node, context) => {
    const { tagName, scope, op } = node.data;
    if (!tagName) return { next: 'default' };
    if (scope === 'global') {
      const set = new Set(context.globalTags ?? []);
      if (op === 'remove') set.delete(tagName);
      else set.add(tagName);
      context.globalTags = Array.from(set);
    } else {
      const set = new Set(context.tags ?? []);
      if (op === 'remove') set.delete(tagName);
      else set.add(tagName);
      context.tags = Array.from(set);
    }
    return { next: 'default' };
  }
};

function evaluateCondition(actual, operator, expected) {
  switch (operator) {
    case 'equals':
      return String(actual) === String(expected);
    case 'notEquals':
      return String(actual) !== String(expected);
    case 'contains':
      return String(actual ?? '').includes(String(expected));
    case 'greaterThan':
      return Number(actual) > Number(expected);
    case 'lessThan':
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

export function getHandler(type) {
  return handlers[type];
}

function resolveTargetChatId(data, context) {
  if (data.targetType === 'variable') {
    const bag = (data.scope === 'global' ? context.globalVariables : context.variables) ?? {};
    return bag[data.targetVariableName] || null;
  }
  if (data.targetType === 'manual') {
    return interpolate(data.targetManual, context) || null;
  }
  // 'group' and 'user' — picked from the bot's known chats in the editor
  return data.targetChatId || null;
}

// Telegram has no reply keyboard outside private chats — the editor can
// only guess at this for "Сообщение" (it always replies in whatever chat
// triggered it), so this is the actual, reliable check, done right before
// sending.
function resolveButtonsLayout(requestedLayout, context) {
  if (requestedLayout !== 'keyboard') return 'inline';
  return context.chatType && context.chatType !== 'private' ? 'inline' : 'keyboard';
}

// Builds the button list actually handed to api.sendMessage/editMessage,
// registering each callback/keyboard button's target under `nodeId` so a
// later press can be traced back to it — inline via callback_data
// (buttonId.js), keyboard via context.pendingKeyboard (webhook persists it
// to chat_state.pending_keyboard, matched by the button's own text).
function buildButtons(nodeId, rawButtons, layout, context) {
  if (layout === 'keyboard') {
    context.pendingKeyboard = Object.fromEntries(
      rawButtons.map((b, i) => [b.text, { nodeId, buttonId: getButtonId(b, i) }])
    );
    return rawButtons.map((b) => ({ text: b.text, kind: 'keyboard', newRow: b.newRow, style: b.style }));
  }
  return rawButtons.map((b, i) =>
    b.kind === 'url'
      ? { text: b.text, kind: 'url', url: b.url, newRow: b.newRow, style: b.style }
      : {
          text: b.text,
          kind: 'callback',
          callbackData: buildCallbackData(nodeId, getButtonId(b, i)),
          newRow: b.newRow,
          style: b.style
        }
  );
}

// Shared by "Сообщение" and "Сообщение с ИИ": if the block has "Редактировать
// предыдущее сообщение" on and we actually arrived here via a button press
// (context.sourceMessageId set), edit that message in place. Otherwise, or
// if the edit fails (message too old/gone), send a normal new message.
// Telegram's editMessageText can never attach a reply keyboard, only an
// inline one — so a keyboard-layout message always sends fresh.
async function sendOrEditMessage(node, context, api, payload) {
  const canEdit =
    node.data.editPrevious && context.sourceMessageId && api.editMessage && payload.buttonsLayout !== 'keyboard';
  if (canEdit) {
    const edited = await api.editMessage(context.chatId, context.sourceMessageId, payload);
    if (edited) {
      context.sourceMessageId = edited; // keep chaining edits to the same bubble
      return edited;
    }
  }
  const sent = await api.sendMessage(context.chatId, payload);
  if (node.data.editPrevious && payload.buttonsLayout !== 'keyboard') context.sourceMessageId = sent ?? context.sourceMessageId;
  return sent;
}

function rememberMessageId(context, nodeId, messageId) {
  if (!messageId) return;
  context.messageIds = context.messageIds || {};
  context.messageIds[nodeId] = messageId;
}

// Looks for a trailing "BUTTONS: A | B | C" line the AI was asked to add
// (see the aiMessage handler above) and pulls it out of the visible text.
function splitQuickReplyButtons(rawReply) {
  const match = /\n?BUTTONS:\s*(.+?)\s*$/i.exec(rawReply ?? '');
  if (!match) return { text: rawReply, labels: [] };

  const labels = match[1]
    .split('|')
    .map((s) => s.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 4);
  if (!labels.length) return { text: rawReply, labels: [] };

  return { text: rawReply.slice(0, match.index).trim(), labels };
}
