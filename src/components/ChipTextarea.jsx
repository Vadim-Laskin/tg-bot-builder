// A text field that shows {{variable}} as an inline turquoise chip right
// in the field — not a preview alongside it — and treats the whole chip as
// ONE character: one Backspace/Delete removes it, on desktop and on phones.
//
// Built on contentEditable rather than a plain <textarea>, because a
// textarea can only show raw characters — there's no way to render part of
// its value as a shorter, styled inline element inside it.
//
// How a chip is built (same idea as mention/embed blots in Quill):
//
//   <span class="chip-wrap">            ← wrapper, no visual style
//     "﻿"                          ← left guard: a real, invisible text character
//     <span class="var-chip"            ← the visible pill, contentEditable="false",
//           data-var-name="Name"/>        its label is drawn by CSS (::before), no text inside
//     "﻿"                          ← right guard
//   </span>
//
// Why guards. A bare contentEditable="false" island is something phone
// keyboards can neither put the caret next to nor delete: Backspace after it
// does nothing, or eats the text before it. The guards are ordinary
// characters, so every keyboard deletes them natively. As soon as a guard
// disappears the chip is "dead", and normalizeChips() removes the whole pill —
// that is what makes the chip behave like a single character.
// The label is deliberately NOT text in the DOM: keyboards treat visible text
// next to the caret as a word, "autocorrect" it on space and insert it again.
//
// The plain-text form ("Hi {{Name}}") stays the real value — same thing
// interpolate() reads — this component only ever changes how it's *shown*.

import { useEffect, useRef } from 'react';
import { splitIntoChipSegments } from '../engine/textChips.js';

export default function ChipTextarea({ value, onChange, variableDefs, placeholder, minHeight = 76 }) {
  const elRef = useRef(null);
  const lastValueRef = useRef(); // last value that is shown in the field
  const composingRef = useRef(false); // true while a phone keyboard is composing a word
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
    const el = elRef.current;
    // Пока клавиатура телефона собирает слово (композиция), DOM не трогаем — иначе слово задвоится.
    if (!composingRef.current) normalizeChips(el);
    // после «выделить всё → стереть» браузер оставляет в пустом поле одиночный <br> — убираем его
    if (
      !el.querySelector('.var-chip') &&
      el.querySelectorAll('br').length === 1 &&
      !stripGuards(el.textContent ?? '')
    ) {
      el.innerHTML = '';
    }
    const next = serialize(el);
    if (next === lastValueRef.current) return; // ничего не изменилось (например, input после execCommand)
    lastValueRef.current = next;
    pendingRef.current = [...pendingRef.current, next].slice(-50);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const el = elRef.current;
    normalizeChips(el);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    leaveChipGuards(range); // перенос строки не должен оказаться внутри обёртки чипа
    range.deleteContents();
    const br = document.createElement('br');
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    // в конце поля одного <br> мало: без второго курсор не появится на новой строке
    if (!br.nextSibling) range.insertNode(document.createElement('br')), range.setStartAfter(br);
    sel.removeAllRanges();
    sel.addRange(range);
    emitChange();
  };

  const onPaste = (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    emitChange();
  };

  const insertVariable = (name) => {
    const el = elRef.current;
    el.focus();
    normalizeChips(el);
    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // no cursor was in this field — insert at the end
    }
    leaveChipGuards(range); // не вставляем чип внутрь другого чипа
    range.deleteContents();
    const chip = makeChipEl(name);
    range.insertNode(chip);
    // курсор — сразу после чипа, в его правом «охранном» символе
    const rightGuard = chip.lastChild;
    range.setStart(rightGuard, rightGuard.data.length);
    range.collapse(true);
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
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          emitChange(); // слово готово — теперь можно привести чипы в порядок
        }}
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

// ---------------------------------------------------------------------------
// chip DOM
// ---------------------------------------------------------------------------

// «Охранный» символ по краям чипа: невидимый, нулевой ширины, но настоящий текст.
const GUARD = '﻿';

const isWrap = (n) => n?.nodeType === Node.ELEMENT_NODE && n.classList.contains('chip-wrap');
const isBody = (n) => n?.nodeType === Node.ELEMENT_NODE && n.classList.contains('var-chip');
const isText = (n) => n?.nodeType === Node.TEXT_NODE;

function makeChipEl(name) {
  const wrap = document.createElement('span');
  wrap.className = 'chip-wrap';

  const body = document.createElement('span');
  body.className = 'var-chip';
  body.contentEditable = 'false';
  body.dataset.varName = name;
  // Подпись рисует CSS (.chip-textarea .var-chip::before) — текста внутри нет (см. шапку файла).
  body.setAttribute('aria-label', name);

  wrap.append(document.createTextNode(GUARD), body, document.createTextNode(GUARD));
  return wrap;
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

const stripGuards = (t) => t.split(GUARD).join('');

// Текст из DOM в строку вида "Hi {{Name}}". Охранные символы в значение не попадают.
function serializeInline(node) {
  if (isText(node)) return stripGuards(node.textContent);
  if (node.nodeName === 'BR') return '\n';
  if (isBody(node)) return `{{${node.dataset.varName}}}`;
  if (isWrap(node)) return [...node.childNodes].map(serializeInline).join('');
  return stripGuards(node.textContent ?? '');
}

function serialize(el) {
  if (!el) return '';
  let out = '';
  for (const node of el.childNodes) {
    if (isText(node) || node.nodeName === 'BR' || isWrap(node) || isBody(node)) {
      out += serializeInline(node);
    } else {
      // some browsers wrap a fresh line in a <div> instead of using <br>
      out += (out ? '\n' : '') + [...node.childNodes].map(serializeInline).join('');
    }
  }
  return out;
}

// Если курсор стоит внутри обёртки чипа — переносим его вплотную к чипу снаружи.
function leaveChipGuards(range) {
  const node = range.startContainer;
  const wrap = (isText(node) ? node.parentElement : node)?.closest?.('.chip-wrap');
  if (!wrap || !range.collapsed) return;
  const afterBody = wrap.lastChild === node || (isText(node) && node === wrap.lastChild);
  if (afterBody) range.setStartAfter(wrap);
  else range.setStartBefore(wrap);
  range.collapse(true);
}

// Приводит все чипы в порядок после ввода:
//  • «мёртвый» чип (стёрт охранный символ или сама плашка) удаляется целиком — это и есть «чип как один символ»;
//  • текст, который браузер напечатал внутрь обёртки (рядом с охранным символом), выносится наружу.
// Курсор при этом остаётся там, где был.
function normalizeChips(el) {
  if (!el) return;
  const wraps = [...el.querySelectorAll('.chip-wrap')];
  if (wraps.length === 0) return;

  const sel = window.getSelection();
  let caret = null;
  if (sel && sel.rangeCount > 0 && sel.isCollapsed && el.contains(sel.anchorNode)) {
    caret = { node: sel.anchorNode, offset: sel.anchorOffset };
  }
  let touched = false;

  // вырезает охранные символы из текстового узла и сдвигает запомненный курсор
  const strip = (t) => {
    if (caret && caret.node === t) {
      caret.offset -= t.data.slice(0, caret.offset).split(GUARD).length - 1;
    }
    t.data = stripGuards(t.data);
  };

  for (const wrap of wraps) {
    const kids = [...wrap.childNodes];
    const bodyIdx = kids.findIndex(isBody);
    const before = bodyIdx === -1 ? kids : kids.slice(0, bodyIdx);
    const after = bodyIdx === -1 ? [] : kids.slice(bodyIdx + 1);
    const guardsIn = (nodes) => nodes.reduce((n, k) => n + (isText(k) ? k.data.split(GUARD).length - 1 : 0), 0);
    const alive = bodyIdx !== -1 && guardsIn(before) >= 1 && guardsIn(after) >= 1;

    // нормальный чип: слева один охранный символ, справа один, больше ничего — трогать нечего
    const clean =
      alive &&
      before.length === 1 &&
      after.length === 1 &&
      isText(before[0]) &&
      before[0].data === GUARD &&
      isText(after[0]) &&
      after[0].data === GUARD;
    if (clean) continue;

    touched = true;
    const parent = wrap.parentNode;
    const body = bodyIdx === -1 ? null : kids[bodyIdx];
    const moved = (nodes) => {
      const out = [];
      for (const k of nodes) {
        if (isText(k)) {
          strip(k);
          if (k.data === '') {
            if (caret && caret.node === k) caret = { node: wrap, offset: -1 }; // уточним ниже
            continue;
          }
        }
        out.push(k);
      }
      return out;
    };
    const beforeOut = moved(before);
    const afterOut = moved(after);

    // чип сохраняем, только если он жив: тогда в обёртке остаются плашка и по одному охранному символу
    for (const k of beforeOut) parent.insertBefore(k, wrap);
    const anchorAfter = wrap.nextSibling;
    for (const k of afterOut) parent.insertBefore(k, anchorAfter);

    if (alive) {
      wrap.replaceChildren(document.createTextNode(GUARD), body, document.createTextNode(GUARD));
      if (caret?.node === wrap) {
        caret = caret.offset === -1 ? { node: wrap.lastChild, offset: 1 } : { node: wrap.lastChild, offset: 1 };
      }
    } else {
      // мёртвый чип: плашку и обёртку убираем, текст вокруг остаётся
      const idx = [...parent.childNodes].indexOf(wrap);
      wrap.remove();
      if (caret && (caret.node === wrap || caret.node === body)) caret = { node: parent, offset: idx };
    }
  }

  if (touched && caret && el.contains(caret.node)) {
    const max = isText(caret.node) ? caret.node.data.length : caret.node.childNodes.length;
    sel.collapse(caret.node, Math.max(0, Math.min(caret.offset, max)));
  }
}
