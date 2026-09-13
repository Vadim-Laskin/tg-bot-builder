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
    const rawButtons = node.data.buttons ?? [];
    const buttons = rawButtons.map((b, i) =>
      b.kind === 'url'
        ? { text: b.text, kind: 'url', url: b.url }
        : { text: b.text, kind: 'callback', callbackData: buildCallbackData(node.id, getButtonId(b, i)) }
    );

    const messageId = await sendOrEditMessage(node, context, api, { text, buttons });
    rememberMessageId(context, node.id, messageId);

    // Callback buttons mean the flow should pause and wait for a press —
    // it resumes later from that specific button's handle (see
    // flowEngine.js's `resume` trigger), not by continuing straight on.
    const hasCallbackButtons = buttons.some((b) => b.kind === 'callback');
    return { next: hasCallbackButtons ? 'stop' : 'default' };
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

    const messageId = await sendOrEditMessage(node, context, api, { text: reply, buttons });
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

// Shared by "Сообщение" and "Сообщение с ИИ": if the block has "Редактировать
// предыдущее сообщение" on and we actually arrived here via a button press
// (context.sourceMessageId set), edit that message in place. Otherwise, or
// if the edit fails (message too old/gone), send a normal new message.
async function sendOrEditMessage(node, context, api, payload) {
  if (node.data.editPrevious && context.sourceMessageId && api.editMessage) {
    const edited = await api.editMessage(context.chatId, context.sourceMessageId, payload);
    if (edited) {
      context.sourceMessageId = edited; // keep chaining edits to the same bubble
      return edited;
    }
  }
  const sent = await api.sendMessage(context.chatId, payload);
  if (node.data.editPrevious) context.sourceMessageId = sent ?? context.sourceMessageId;
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
