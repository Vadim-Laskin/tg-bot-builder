import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from 'reactflow';
import { ButtonsContext } from '../ButtonsContext.js';
import { groupButtonsIntoRows, moveButton } from '../../engine/buttonLayout.js';

const HOLD_MS = 320; // сколько держать, чтобы начать перенос
const MOVE_TOLERANCE = 6; // px: дальше — это уже не тап

// Кнопки на карточке блока выглядят как в Telegram и не редактируются на
// месте: тап — открыть настройки кнопки, зажать и потянуть — переставить.
export default function NodeButtons({ nodeId, buttons, layout }) {
  const ctx = useContext(ButtonsContext);
  const rows = groupButtonsIntoRows(buttons);
  const isKbd = layout === 'keyboard';

  const cellRefs = useRef({});
  const press = useRef(null);
  const dropRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, text, style, w, h, x, y, offX, offY }
  const [drop, setDrop] = useState(null); // { id, mode }

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const setDropBoth = (d) => {
    dropRef.current = d;
    setDrop(d);
  };

  const computeDrop = (x, y, movedId) => {
    let best = null;
    for (const b of buttons) {
      if (b.id === movedId) continue;
      const el = cellRefs.current[b.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { id: b.id, r, dist };
    }
    if (!best || best.dist > 70) return null;

    const { r } = best;
    let mode;
    if (best.dist === 0) {
      const rx = (x - r.left) / r.width;
      const ry = (y - r.top) / r.height;
      mode = rx < 0.3 ? 'before' : rx > 0.7 ? 'after' : ry < 0.5 ? 'above' : 'below';
    } else if (y < r.top) mode = 'above';
    else if (y > r.bottom) mode = 'below';
    else mode = x < r.left ? 'before' : 'after';
    return { id: best.id, mode };
  };

  const beginDrag = (s, b) => {
    s.dragging = true;
    navigator.vibrate?.(12);
    setDrag({
      id: b.id,
      text: b.text,
      style: b.style || '',
      w: s.rect.width,
      h: s.rect.height,
      x: s.lastX,
      y: s.lastY,
      offX: s.offX,
      offY: s.offY
    });
  };

  const onPointerDown = (b) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = {
      id: b.id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      rect,
      dragging: false,
      timer: null
    };
    s.timer = setTimeout(() => press.current === s && beginDrag(s, b), HOLD_MS);
    press.current = s;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* не критично */
    }
  };

  const onPointerMove = (b) => (e) => {
    const s = press.current;
    if (!s || s.pointerId !== e.pointerId) return;
    s.lastX = e.clientX;
    s.lastY = e.clientY;

    if (!s.dragging) {
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) <= MOVE_TOLERANCE) return;
      clearTimeout(s.timer);
      if (s.pointerType === 'mouse') beginDrag(s, b); // мышью можно сразу потянуть
      else press.current = null; // пальцем — это был жест, не тап
      return;
    }
    setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY });
    setDropBoth(computeDrop(e.clientX, e.clientY, s.id));
  };

  const finish = (e, cancelled) => {
    const s = press.current;
    if (!s || s.pointerId !== e.pointerId) return;
    clearTimeout(s.timer);
    press.current = null;

    if (s.dragging) {
      const d = dropRef.current;
      if (!cancelled && d) ctx?.changeButtons(nodeId, moveButton(buttons, s.id, d.id, d.mode));
      setDrag(null);
      setDropBoth(null);
    } else if (!cancelled) {
      ctx?.openButton(nodeId, s.id); // обычный тап
    }
  };

  return (
    <>
      <div className={`tg-buttons${isKbd ? ' tg-buttons--kbd' : ''}`}>
        {rows.map((row, ri) => (
          <div className="tg-row" key={ri}>
            {row.map((b) => {
              const wireable = isKbd || b.kind !== 'url';
              const dropMode = drop?.id === b.id ? drop.mode : null;
              return (
                <div
                  key={b.id}
                  ref={(el) => (cellRefs.current[b.id] = el)}
                  className={`node__button-cell${dropMode ? ` drop-${dropMode}` : ''}`}
                >
                  <div
                    className={[
                      'tg-btn nodrag nopan',
                      `tg-btn--${b.style || 'default'}`,
                      isKbd ? 'tg-btn--kbd' : '',
                      ctx?.editing?.nodeId === nodeId && ctx.editing.buttonId === b.id ? 'is-editing' : '',
                      drag?.id === b.id ? 'is-dragging' : ''
                    ].join(' ')}
                    onPointerDown={onPointerDown(b)}
                    onPointerMove={onPointerMove(b)}
                    onPointerUp={(e) => finish(e, false)}
                    onPointerCancel={(e) => finish(e, true)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <span className="tg-btn__text">{b.text || 'Кнопка'}</span>
                    {!isKbd && b.kind === 'url' && <span className="tg-btn__link">↗</span>}
                  </div>
                  {wireable && (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`btn-${b.id}`}
                      className="node__button-handle"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {ctx && (
          <button className="tg-add nodrag nopan" onClick={() => ctx.addButton(nodeId)}>
            ＋ Кнопка
          </button>
        )}
      </div>

      {drag &&
        createPortal(
          <div
            className={`tg-btn tg-ghost tg-btn--${drag.style || 'default'}${isKbd ? ' tg-btn--kbd' : ''}`}
            style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w, height: drag.h }}
          >
            <span className="tg-btn__text">{drag.text || 'Кнопка'}</span>
          </div>,
          document.body
        )}
    </>
  );
}
