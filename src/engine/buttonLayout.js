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

// ---------- перестановка кнопок (перетаскивание на холсте) ----------

export const MAX_BUTTONS_PER_ROW = 8; // лимит Telegram

// обратная операция к groupButtonsIntoRows: первая кнопка ряда — с новой
// строки, остальные — «в один ряд с предыдущей»
export function rowsToButtons(rows) {
  return rows.flatMap((row) => row.map((b, i) => ({ ...b, newRow: i === 0 })));
}

/**
 * Переносит кнопку `movedId` относительно кнопки `targetId`.
 * mode: 'before' | 'after' — в тот же ряд слева/справа от цели;
 *       'above'  | 'below' — отдельным рядом над/под рядом цели.
 */
export function moveButton(buttons, movedId, targetId, mode) {
  if (movedId === targetId) return buttons;
  const moved = buttons.find((b) => b.id === movedId);
  if (!moved) return buttons;

  // ряды считаем по полному списку — иначе при удалении первой кнопки ряда
  // её сосед с newRow:false «прилипнет» к предыдущему ряду
  const rows = groupButtonsIntoRows(buttons)
    .map((row) => row.filter((b) => b.id !== movedId))
    .filter((row) => row.length > 0);

  const ri = rows.findIndex((row) => row.some((b) => b.id === targetId));
  if (ri === -1) return buttons;

  let m = mode;
  if ((m === 'before' || m === 'after') && rows[ri].length >= MAX_BUTTONS_PER_ROW) m = 'below';

  if (m === 'before' || m === 'after') {
    const ci = rows[ri].findIndex((b) => b.id === targetId);
    rows[ri].splice(m === 'before' ? ci : ci + 1, 0, moved);
  } else {
    rows.splice(m === 'above' ? ri : ri + 1, 0, [moved]);
  }
  return rowsToButtons(rows);
}
