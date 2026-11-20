// Переименование переменной или тега: имя — это ключ, по которому блоки и значения
// пользователей находят друг друга, поэтому при смене названия обновляем и ссылки в блоках.
import { variableRegExp, normalizeVariableName } from './textChips.js';

// «{{Старое}}» → «{{Новое}}» во всех строках внутри данных блока (тексты, кнопки, ответы и т.д.)
function renameInText(text, oldName, newName) {
  return text.replace(variableRegExp(), (whole, name) =>
    normalizeVariableName(name) === oldName ? `{{${newName}}}` : whole
  );
}

function walk(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, fn);
    return out;
  }
  return value;
}

// Поля блоков, где хранится имя (рядом лежит *Id из реестра — по нему и сверяем, имя — запасной вариант).
const VARIABLE_FIELDS = [
  ['variableId', 'variableName'],
  ['captureVariableId', 'captureVariableName']
];
const TAG_FIELDS = [['tagId', 'tagName']];

/**
 * Возвращает новую версию узлов с обновлёнными ссылками и флаг, менялось ли что-нибудь.
 * kind: 'variable' | 'tag'
 */
export function renameInNodes(nodes, { kind, id, oldName, newName }) {
  const fields = kind === 'variable' ? VARIABLE_FIELDS : TAG_FIELDS;
  let changed = false;
  const next = (nodes ?? []).map((node) => {
    let data = node.data ?? {};
    let touched = false;

    for (const [idKey, nameKey] of fields) {
      if (data[nameKey] && (data[idKey] === id || (!data[idKey] && data[nameKey] === oldName))) {
        if (data[nameKey] !== newName) {
          data = { ...data, [nameKey]: newName };
          touched = true;
        }
      }
    }

    if (kind === 'variable') {
      const replaced = walk(data, (s) => renameInText(s, oldName, newName));
      if (JSON.stringify(replaced) !== JSON.stringify(data)) {
        data = replaced;
        touched = true;
      }
    }

    if (!touched) return node;
    changed = true;
    return { ...node, data };
  });
  return { nodes: next, changed };
}
