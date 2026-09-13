import { useState } from 'react';
import Modal from './Modal.jsx';
import { useBotStore } from '../store/useBotStore.js';
import { TAG_COLORS } from '../engine/tagColors.js';

export default function TagsModal({ bot, onClose }) {
  const createTag = useBotStore((s) => s.createTag);
  const deleteTag = useBotStore((s) => s.deleteTag);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('personal');
  const [color, setColor] = useState(TAG_COLORS[0]);

  const add = async () => {
    if (!name.trim()) return;
    await createTag(bot.id, { name: name.trim(), color, scope });
    setName('');
  };

  return (
    <Modal title="Теги" onClose={onClose} wide>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '-4px 0 14px', lineHeight: 1.4 }}>
        Личный — есть или нет у конкретного пользователя. Общий — включён или выключен сразу для всех.
      </p>

      <div className="registry-list">
        {bot.tagDefs.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Тегов пока нет — добавьте первый ниже.</p>
        )}
        {bot.tagDefs.map((t) => (
          <div className="registry-row" key={t.id}>
            <span className="registry-row__dot" style={{ background: t.color }} />
            <span className="registry-row__name">{t.name}</span>
            <span className="registry-row__badge">{t.scope === 'global' ? 'общий' : 'личный'}</span>
            <button className="btn btn--sm btn--danger" onClick={() => deleteTag(bot.id, t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="registry-add">
        <input
          className="input"
          placeholder="Название тега"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="color-swatches">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${c === color ? ' is-selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value)} style={{ flex: 1 }}>
            <option value="personal">Личный</option>
            <option value="global">Общий</option>
          </select>
          <button className="btn btn--primary btn--sm" onClick={add}>
            + Добавить
          </button>
        </div>
      </div>
    </Modal>
  );
}
