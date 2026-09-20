// Telegram Bot API 9.4 (Feb 2026) added real button colors — a `style`
// field on both InlineKeyboardButton and KeyboardButton. Only these three
// named colors exist (plus "no style" = Telegram's own default look); it's
// not an arbitrary palette like tags get, so the editor offers exactly
// these four, matching what actually renders in the app.
// Older Telegram clients (before Feb 9, 2026) just ignore the field and
// show a normal button — harmless either way.

export const BUTTON_STYLES = [
  { value: '', label: 'Обычная', color: null },
  { value: 'primary', label: 'Синяя', color: '#3e8ede' },
  { value: 'success', label: 'Зелёная', color: '#34c759' },
  { value: 'danger', label: 'Красная', color: '#e1526b' }
];
