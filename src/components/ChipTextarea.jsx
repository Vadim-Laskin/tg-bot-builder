// A text field that shows {{variable}} as an inline turquoise chip right
// in the field — not a preview alongside it — and deletes the whole chip
// in one Backspace/Delete, the way Notion/Slack-style mention chips work.
//
// Built on contentEditable rather than a plain <textarea>, because a
// textarea can only show raw characters — there's no way to render part of
// its value as a shorter, styled inline element inside it. The chip is a
// contentEditable="false" island inside the editable box; browsers already
// treat those as a single atomic unit for cursor movement and deletion, so
// no custom keyboard handling is needed for that part.
//
// The plain-text form ("Hi {{Name}}") stays the real value — same thing
// interpolate() reads — this component only ever changes how it's *shown*.

import { useEffect, useRef } from 'react';
import { splitIntoChipSegments } from '../engine/textChips.js';

export default function ChipTextarea({ value, onChange, variableDefs, placeholder, minHeight = 76 }) {
  const elRef = useRef(null);
  const lastValueRef = useRef(); // last value that is shown in the field
  // Значения, которые поле само отправило наверх, но родитель ещё не вернул обратно.
  // Родитель отвечает не мгновенно (автосохранение, батчинг React, эхо из хранилища), и пока
  // человек печатает, пропс может отставать от поля на несколько символов. Перерисовать поле
  // таким отставшим значением нельзя: курсор прыгает, символы теряются, а при вводе с
  // клавиатуры телефона (IME-композиция) текст ещё и дублируется.
  const pendingRef = useRef([]);

  useEffect(() => {
    const el = elRef.current;
    const incoming = value ?? '';
    if (incoming === lastValueRef.current) {
      pendingRef.current = []; // родитель догнал поле — всё синхронно
      return;
    }
    const i = pendingRef.current.indexOf(incoming);
    if (i !== -1) {
      pendingRef.current = pendingRef.current.slice(i + 1); // отставшее эхо нашего же ввода — игнорируем
      return;
    }
    if (el && serialize(el) === incoming) {
      lastValueRef.current = incoming; // в поле уже ровно этот текст — трогать DOM незачем
      pendingRef.current = [];
      return;
    }
    // значение действительно изменили снаружи (другой блок, вставка переменной, откат) — показываем его
    renderInto(el, incoming);
    lastValueRef.current = incoming;
    pendingRef.current = [];
  }, [value]);

  useEffect(() => {
    renderInto(elRef.current, value);
    lastValueRef.current = value ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = () => {
    const next = serialize(elRef.current);
    if (next === lastValueRef.current) return; // ничего не изменилось (например, input после execCommand)
    lastValueRef.current = next;
    pendingRef.current = [...pendingRef.current, next].slice(-50);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      emitChange();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (deleteChipNextToCaret(e.key === 'Backspace' ? 'before' : 'after')) e.preventDefault();
    }
  };

  // Клавиатуры телефонов (Gboard и др.) часто шлют Backspace как «Unidentified»/keyCode 229 —
  // keydown с key === 'Backspace' не приходит, и чип стирался бы по одному символу или не удалялся.
  // Зато удаление всегда проходит через beforeinput, его ловим отдельно.
  // Нативный слушатель, а не React onBeforeInput: тот не настоящий beforeinput.
  const deleteRef = useRef(null);
  deleteRef.current = deleteChipNextToCaret;
  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;
    const onBeforeInput = (e) => {
      if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') return;
      if (deleteRef.current(e.inputType === 'deleteContentBackward' ? 'before' : 'after')) e.preventDefault();
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  // Если рядом с курсором (и ничего не выделено) стоит чип переменной — удаляем его целиком.
  function deleteChipNextToCaret(side) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false; // выделение удаляется обычным образом
    if (!elRef.current?.contains(sel.anchorNode)) return false;
    const chip = findAdjacentChip(sel.getRangeAt(0), side);
    if (!chip) return false;
    chip.remove();
    emitChange();
    return true;
  }

  const onPaste = (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    emitChange();
  };

  const insertVariable = (name) => {
    const el = elRef.current;
    el.focus();
    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // no cursor was in this field — insert at the end
    }
    range.deleteContents();
    const chip = makeChipEl(name);
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.setEndAfter(chip);
    sel.removeAllRanges();
    sel.addRange(range);
    emitChange();
  };

  return (
    <div>
      <div
        ref={elRef}
        className="chip-textarea"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        data-placeholder={placeholder ?? ''}
      />
      {variableDefs?.length > 0 && (
        <select
          className="select"
          style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}
          value=""
          onChange={(e) => e.target.value && insertVariable(e.target.value)}
        >
          <option value="">{'{{ }} Вставить переменную…'}</option>
          {variableDefs.map((v) => (
            <option key={v.id} value={v.name}>
              {v.name} ({v.scope === 'global' ? 'общая' : 'личная'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Is a variable chip sitting immediately before/after the cursor? Covers
// both "cursor is a text offset inside the container, right next to the
// chip node" and "cursor's container IS the chip's parent, positioned at
// the chip's own index" — how the caret lands depends on the browser.
function findAdjacentChip(range, side) {
  const { startContainer, startOffset } = range;
  const isChip = (n) => n?.nodeType === 1 && n.classList?.contains('var-chip');
  const isEmptyText = (n) => n?.nodeType === Node.TEXT_NODE && n.textContent === '';
  // после стирания текста рядом с чипом остаются пустые текстовые узлы — перешагиваем через них
  const skip = (n, dir) => {
    while (isEmptyText(n)) n = dir === 'before' ? n.previousSibling : n.nextSibling;
    return n;
  };

  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (side === 'before' && startOffset === 0) {
      const prev = skip(startContainer.previousSibling, 'before');
      return isChip(prev) ? prev : null;
    }
    if (side === 'after' && startOffset === startContainer.textContent.length) {
      const next = skip(startContainer.nextSibling, 'after');
      return isChip(next) ? next : null;
    }
    return null;
  }

  // caret sits directly in the element (e.g. an empty field, or right
  // between two sibling nodes) — startOffset is a child index there
  const sibling = skip(
    side === 'before' ? startContainer.childNodes[startOffset - 1] : startContainer.childNodes[startOffset],
    side
  );
  return isChip(sibling) ? sibling : null;
}

function makeChipEl(name) {
  const chip = document.createElement('span');
  chip.className = 'var-chip';
  chip.contentEditable = 'false';
  chip.dataset.varName = name;
  chip.textContent = name;
  return chip;
}

function renderInto(el, value) {
  if (!el) return;
  el.innerHTML = '';
  for (const seg of splitIntoChipSegments(value ?? '')) {
    if (seg.type === 'variable') {
      el.appendChild(makeChipEl(seg.name));
    } else {
      const lines = seg.value.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        if (line) el.appendChild(document.createTextNode(line));
      });
    }
  }
}

function serialize(el) {
  if (!el) return '';
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
    } else if (node.nodeName === 'BR') {
      out += '\n';
    } else if (node.classList?.contains('var-chip')) {
      out += `{{${node.dataset.varName}}}`;
    } else {
      // some browsers wrap a fresh line in a <div> instead of using <br>
      out += (out ? '\n' : '') + (node.textContent ?? '');
    }
  }
  return out;
}
