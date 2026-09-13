// Converts the common Markdown that an LLM (or a person) naturally types —
// **bold**, *italic*/_italic_, `code`, [text](url) — into the HTML that
// Telegram's parse_mode: 'HTML' understands, so it actually renders instead
// of showing up as literal asterisks.
//
// The same output is valid browser HTML too (just <b>/<i>/<code>/<a>), so
// TestPanel.jsx renders it directly for an accurate preview — one
// converter, both places.
//
// Order matters: HTML-escape the raw text first (before any tags of ours
// exist), then bold before italic, so "**x**" can't be partially eaten by
// the single-asterisk italic pattern.

export function formatMessageText(raw) {
  if (typeof raw !== 'string') return '';

  let text = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/`([^`]+?)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_]+?)__/g, '<b>$1</b>');
  text = text.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
  text = text.replace(/_([^_]+?)_/g, '<i>$1</i>');

  return text;
}
