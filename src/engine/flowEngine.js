// Flow execution engine.
//
// This module knows nothing about React, Telegram or Groq — it just walks
// a graph of { nodes, edges } and calls whatever IO functions it's given
// through `api`. That means the exact same engine can run:
//   1. in the browser, with a mocked `api`, to preview a flow while editing;
//   2. in a Netlify Function, with a real `api` that calls Telegram + Groq.
//
// Graph shape (matches React Flow's nodes/edges):
//   node:  { id, type, data }
//   edge:  { id, source, target, sourceHandle?, targetHandle? }
//
// `sourceHandle` is used for branching nodes (condition -> 'true' | 'false').
// Nodes with a single output just use the default (null/undefined) handle.

import { getHandler } from './nodeHandlers.js';

const MAX_STEPS = 300; // guards against accidental infinite loops via chains

/**
 * @param {object} params
 * @param {{nodes: any[], edges: any[]}} params.graph
 * @param {{type: string, value?: string}} params.trigger
 * @param {{variables: object, tags: string[], chatId: any, botId?: string}} params.context
 * @param {object} params.api - injected IO: sendMessage, callGroq, httpRequest, resolveChain, log
 */
export async function runFlow({ graph, trigger, context, api }) {
  const entryNodes = graph.nodes.filter(
    (n) => n.type === 'event' && matchesTrigger(n.data, trigger)
  );

  if (entryNodes.length === 0) {
    api.log?.(`Нет события, подходящего под триггер: ${trigger.type} ${trigger.value ?? ''}`);
    return context;
  }

  let steps = 0;
  for (const entry of entryNodes) {
    steps = await walk(entry, graph, context, api, steps, new Set());
  }
  return context;
}

function matchesTrigger(eventData, trigger) {
  if (eventData.triggerType !== trigger.type) return false;
  if (trigger.type === 'schedule') return true;
  if (trigger.type === 'text') return true; // plain text events pass through; real
  // deployments should let a "text" event carry an optional regex in eventData.value
  return eventData.value === trigger.value;
}

async function walk(node, graph, context, api, steps, visitedThisPass) {
  if (steps >= MAX_STEPS) {
    api.log?.('Достигнут лимит шагов флоу — прерываю, проверьте на циклы.');
    return steps;
  }
  steps += 1;

  const handler = getHandler(node.type);
  if (!handler) {
    api.log?.(`Неизвестный тип блока: ${node.type}`);
    return steps;
  }

  const result = await handler(node, context, api);
  const handle = result?.next ?? 'default';
  if (handle === 'stop') return steps;

  const nextEdges = graph.edges.filter(
    (e) => e.source === node.id && (e.sourceHandle ?? 'default') === handle
  );

  for (const edge of nextEdges) {
    const nextNode = graph.nodes.find((n) => n.id === edge.target);
    if (!nextNode) continue;
    steps = await walk(nextNode, graph, context, api, steps, visitedThisPass);
  }
  return steps;
}

/** Render {{variable}} placeholders in a template string against context. */
export function interpolate(template, context) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (key === 'last_message') return context.lastMessage ?? '';
    return context.variables?.[key] ?? '';
  });
}
