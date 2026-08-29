// Each handler receives (node, context, api) and may:
//  - mutate `context` (variables, tags)
//  - call methods on `api` (sendMessage, callGroq, httpRequest...)
//  - return { next: 'default' | 'true' | 'false' | 'stop' } to steer the walk
//
// `api` is injected by whoever runs the engine (see flowEngine.js header).

import { interpolate } from './flowEngine.js';

const handlers = {
  note: async () => ({ next: 'default' }), // visual only, no-op at runtime

  event: async () => ({ next: 'default' }), // entry point, nothing to execute itself

  message: async (node, context, api) => {
    const text = interpolate(node.data.text, context);
    await api.sendMessage(context.chatId, { text, buttons: node.data.buttons ?? [] });
    return { next: 'default' };
  },

  aiMessage: async (node, context, api) => {
    const prompt = interpolate(node.data.userPrompt, context);
    const reply = await api.callGroq({
      model: node.data.model,
      systemPrompt: node.data.systemPrompt,
      userPrompt: prompt
    });
    if (node.data.saveTo) context.variables[node.data.saveTo] = reply;
    await api.sendMessage(context.chatId, { text: reply, buttons: [] });
    return { next: 'default' };
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
    }
    return { next: 'default' };
  },

  condition: async (node, context) => {
    const { variable, operator, value } = node.data;
    const actual = context.variables?.[variable];
    const passed = evaluateCondition(actual, operator, value, context.tags ?? []);
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
    const { name, op, value } = node.data;
    if (!name) return { next: 'default' };
    const rendered = interpolate(value, context);
    if (op === 'clear') delete context.variables[name];
    else if (op === 'increment') {
      context.variables[name] = (Number(context.variables[name]) || 0) + (Number(rendered) || 1);
    } else {
      context.variables[name] = rendered;
    }
    return { next: 'default' };
  },

  setTag: async (node, context) => {
    const { tag, op } = node.data;
    if (!tag) return { next: 'default' };
    const set = new Set(context.tags ?? []);
    if (op === 'remove') set.delete(tag);
    else set.add(tag);
    context.tags = Array.from(set);
    return { next: 'default' };
  }
};

function evaluateCondition(actual, operator, expected, tags) {
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
    case 'hasTag':
      return tags.includes(expected);
    case 'notHasTag':
      return !tags.includes(expected);
    default:
      return false;
  }
}

export function getHandler(type) {
  return handlers[type];
}
