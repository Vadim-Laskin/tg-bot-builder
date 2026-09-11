// Buttons on a "Сообщение" block get their own connection handle, so a
// press can resume the flow from wherever that specific button is wired
// to — instead of buttons only being distinguishable by matching text
// against a separate Событие block, like before.
//
// The Telegram callback_data for a button is `${messageNodeId}::${buttonId}`
// — small enough to fit Telegram's 64-byte limit, and enough for the
// engine/webhook to resume the graph from exactly that edge.

export function getButtonId(button, index) {
  // falls back to a stable index-based id for buttons saved before this
  // feature existed (they won't have `id` yet)
  return button.id || `i${index}`;
}

export function buildCallbackData(nodeId, buttonId) {
  return `${nodeId}::${buttonId}`;
}

export function parseCallbackData(data) {
  if (typeof data !== 'string') return null;
  const sep = data.indexOf('::');
  if (sep === -1) return null;
  const nodeId = data.slice(0, sep);
  const buttonId = data.slice(sep + 2);
  if (!nodeId || !buttonId) return null;
  return { nodeId, buttonId };
}
