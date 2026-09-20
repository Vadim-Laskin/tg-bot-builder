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
  const lastValueRef = useRef(); // last value we ourselves rendered, to avoid clobbering the cursor

  useEffect(() => {
    if (value === lastValueRef.current) return; // our own edit already matches — don't touch the DOM/cursor
    renderInto(elRef.current, value);
    lastValueRef.current = value;
  }, [value]);

  useEffect(() => {
    renderInto(elRef.current, value);
    lastValueRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = () => {
    const next = serialize(elRef.current);
    lastValueRef.current = next;
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
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return; // let a real selection delete normally
      const range = sel.getRangeAt(0);
      const chip = findAdjacentChip(range, e.key === 'Backspace' ? 'before' : 'after');
      if (chip) {
        e.preventDefault();
        chip.remove();
        emitChange();
      }
    }
  };

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

  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (side === 'before' && startOffset === 0) {
      const prev = startContainer.previousSibling;
      return isChip(prev) ? prev : null;
    }
    if (side === 'after' && startOffset === startContainer.textContent.length) {
      const next = startContainer.nextSibling;
      return isChip(next) ? next : null;
    }
    return null;
  }

  // caret sits directly in the element (e.g. an empty field, or right
  // between two sibling nodes) — startOffset is a child index there
  const sibling =
    side === 'before' ? startContainer.childNodes[startOffset - 1] : startContainer.childNodes[startOffset];
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
