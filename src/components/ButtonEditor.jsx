import { useState } from 'react';
import { BLOCK_DEFS } from '../engine/blockDefs.js';
import Modal from './Modal.jsx';

// Порядок и цвета — как реальные цвета кнопок в Telegram (Bot API 9.4+)
const SWATCHES = [
  { value: 'primary', label: 'Синяя', color: 'var(--tg-primary)' },
  { value: '', label: 'Обычная', color: 'var(--tg-default)' },
  { value: 'danger', label: 'Красная', color: 'var(--tg-danger)' },
  { value: 'success', label: 'Зелёная', color: 'var(--tg-success)' }
];

const ICONS = {
  message: '💬',
  aiMessage: '🤖',
  sendToChat: '📨',
  action: '⚡',
  condition: '🔀',
  chain: '🔗',
  setVariable: '🔢',
  setTag: '🏷'
};

// в «Блок для перехода» можно целиться только в блоки со входом (не заметки и не события)
const canBeTarget = (n) => BLOCK_DEFS[n.type]?.ports.in && n.type !== 'note';

function blockTitle(n) {
  const raw = (n.data.text || n.data.userPrompt || '').trim().split('\n')[0];
  return raw.slice(0, 32) || BLOCK_DEFS[n.type].label;
}

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {children}
    </div>
  );
}

// Панель настроек одной кнопки: открывается тапом по кнопке на блоке.
export default function ButtonEditor({ button, layout, blocks, targetId, onPatch, onTarget, onCreateTarget, onDelete, onClose }) {
  const [picking, setPicking] = useState(false);
  const isKbd = layout === 'keyboard'; // у клавиатуры бывают только «переходы»
  const isUrl = !isKbd && button.kind === 'url';
  const target = blocks.find((n) => n.id === targetId);

  return (
    <aside className="properties properties--button button-editor is-open">
      <div className="properties__mobile-header">
        <span>Кнопка</span>
        <button className="btn btn--sm" onClick={onClose}>
          Готово
        </button>
      </div>
      <button className="button-editor__back" onClick={onClose}>
        ← К блоку
      </button>

      {!isKbd && (
        <Field label="Тип кнопки">
          <select
            className="select"
            value={isUrl ? 'url' : 'callback'}
            onChange={(e) => onPatch({ kind: e.target.value })}
          >
            <option value="callback">Переход</option>
            <option value="url">Ссылка</option>
          </select>
        </Field>
      )}

      <Field label="Цвет">
        <div className="bb-swatches">
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              className={`bb-swatch${(button.style || '') === s.value ? ' is-selected' : ''}`}
              style={{ background: s.color }}
              onClick={() => onPatch({ style: s.value })}
              title={s.label}
              aria-label={s.label}
            >
              {(button.style || '') === s.value ? '✓' : ''}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Текст кнопки">
        <input
          className="input"
          value={button.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Текст кнопки"
        />
      </Field>

      {isUrl ? (
        <Field label="Ссылка">
          <input
            className="input"
            value={button.url ?? ''}
            onChange={(e) => onPatch({ url: e.target.value })}
            placeholder="https://…"
            inputMode="url"
            autoCapitalize="off"
          />
        </Field>
      ) : (
        <Field label="Блок для перехода">
          {target ? (
            <div className="bb-target">
              <button className="bb-target__main" onClick={() => setPicking(true)}>
                <span className="bb-target__icon">{ICONS[target.type] ?? '▫️'}</span>
                <span className="bb-target__text">
                  <span className="bb-target__title">{blockTitle(target)}</span>
                  <span className="bb-target__sub">Блок «{BLOCK_DEFS[target.type].label}»</span>
                </span>
              </button>
              <button className="bb-target__clear" onClick={() => onTarget(null)} aria-label="Убрать переход">
                ✕
              </button>
            </div>
          ) : (
            <div className="bb-target bb-target--empty">
              <button className="bb-target__main" onClick={() => setPicking(true)}>
                <span className="bb-target__icon">＋</span>
                <span className="bb-target__text">
                  <span className="bb-target__title">Выбрать блок</span>
                  <span className="bb-target__sub">Куда перейдёт сценарий после нажатия</span>
                </span>
              </button>
            </div>
          )}
        </Field>
      )}

      <button className="bb-delete" onClick={onDelete}>
        🗑 Удалить
      </button>

      {picking && (
        <Modal title="Блок для перехода" onClose={() => setPicking(false)}>
          <div className="bb-picker">
            <button
              className="bb-picker__item bb-picker__item--new"
              onClick={() => {
                onCreateTarget();
                setPicking(false);
              }}
            >
              <span className="bb-target__icon">✨</span>
              <span className="bb-target__text">
                <span className="bb-target__title">Создать новое сообщение</span>
                <span className="bb-target__sub">Блок появится рядом и сразу подключится</span>
              </span>
            </button>
            {blocks.filter(canBeTarget).map((n) => (
              <button
                key={n.id}
                className={`bb-picker__item${n.id === targetId ? ' is-selected' : ''}`}
                onClick={() => {
                  onTarget(n.id);
                  setPicking(false);
                }}
              >
                <span className="bb-target__icon">{ICONS[n.type] ?? '▫️'}</span>
                <span className="bb-target__text">
                  <span className="bb-target__title">{blockTitle(n)}</span>
                  <span className="bb-target__sub">Блок «{BLOCK_DEFS[n.type].label}»</span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </aside>
  );
}
