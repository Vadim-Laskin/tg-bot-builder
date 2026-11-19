// Splits text on {{variable}} tokens so the UI can render them as chips
// instead of raw braces — e.g. "Hi {{Name}}" → [text "Hi ", var "Name"].
// Pure logic, no React — reused by the canvas node body and by the live
// preview under text fields in the properties panel.

// Имя переменной: буквы любого алфавита (в т.ч. русские), цифры, «_» и «.»,
// слова могут разделяться пробелом: {{Имя}}, {{Мой город}}, {{user.name}}.
// Один и тот же шаблон использует интерфейс (чипы) и движок (подстановка значений в бота),
// иначе то, что выглядит переменной в редакторе, не подставилось бы в сообщении.
const WORD = '[\\p{L}\\p{N}_.]+';
const VARIABLE_SOURCE = `\\{\\{\\s*(${WORD}(?:[ \\t]+${WORD})*)\\s*\\}\\}`;

/** Новый RegExp при каждом вызове: у флага g есть состояние (lastIndex), делиться им нельзя. */
export const variableRegExp = () => new RegExp(VARIABLE_SOURCE, 'gu');

/** «Мой   город» → «Мой город»: так имя хранится в реестре переменных. */
export const normalizeVariableName = (name) => String(name).replace(/\s+/g, ' ').trim();

export function splitIntoChipSegments(text) {
  const segments = [];
  const re = variableRegExp();
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text ?? ''))) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'variable', name: normalizeVariableName(match[1]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < (text ?? '').length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}
