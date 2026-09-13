import { useState } from 'react';
import Modal from './Modal.jsx';
import { useBotStore } from '../store/useBotStore.js';
import { VARIABLE_COLOR } from '../engine/tagColors.js';

export default function VariablesModal({ bot, onClose }) {
  const createVariable = useBotStore((s) => s.createVariable);
  const deleteVariable = useBotStore((s) => s.deleteVariable);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('personal');

  const add = async () => {
    if (!name.trim()) return;
    await createVariable(bot.id, { name: name.trim(), scope });
    setName('');
  };

  return (
    <Modal title="Переменные" onClose={onClose} wide>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '-4px 0 14px', lineHeight: 1.4 }}>
        Личная — своё значение у каждого пользователя. Общая — одно значение сразу для всех.
      </p>

      <div className="registry-list">
        {bot.variableDefs.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Переменных пока нет — добавьте первую ниже.</p>
        )}
        {bot.variableDefs.map((v) => (
          <div className="registry-row" key={v.id}>
            <span className="registry-row__dot" style={{ background: VARIABLE_COLOR }} />
            <span className="registry-row__name">{v.name}</span>
            <span className="registry-row__badge">{v.scope === 'global' ? 'общая' : 'личная'}</span>
            <button className="btn btn--sm btn--danger" onClick={() => deleteVariable(bot.id, v.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="registry-add">
        <input
          className="input"
          placeholder="Название переменной"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="personal">Личная</option>
          <option value="global">Общая</option>
        </select>
        <button className="btn btn--primary btn--sm" onClick={add}>
          + Добавить
        </button>
      </div>
    </Modal>
  );
}
