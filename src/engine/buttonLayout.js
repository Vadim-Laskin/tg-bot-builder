// Telegram's keyboard/inline_keyboard is an array of ROWS, each row an
// array of buttons — that's how you get buttons side by side vs stacked.
// We keep the editor's button list flat (simpler to reorder) and mark
// each button with `newRow` to say "start a fresh row here"; this turns
// that flat list into the row structure Telegram actually wants.
// Shared by the canvas (BlockNode.jsx), the preview (TestPanel.jsx) and
// the real send (telegram-webhook.js) so all three agree on the layout.

export function groupButtonsIntoRows(buttons) {
  const rows = [];
  for (const b of buttons ?? []) {
    // default is "new row" — only an explicit false groups with the
    // previous button, so buttons saved before this feature existed
    // (no newRow field at all) keep their old one-per-row look
    if (b.newRow === false && rows.length > 0) rows[rows.length - 1].push(b);
    else rows.push([b]);
  }
  return rows;
}
