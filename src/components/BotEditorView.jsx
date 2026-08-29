import { useState } from 'react';
import FlowCanvas from './FlowCanvas.jsx';
import Modal from './Modal.jsx';
import { useBotStore } from '../store/useBotStore.js';

export default function BotEditorView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const flow = useBotStore((s) => s.getActiveFlow());
  const setActiveFlow = useBotStore((s) => s.setActiveFlow);
  const addChainFlow = useBotStore((s) => s.addChainFlow);
  const setBotSecrets = useBotStore((s) => s.setBotSecrets);
  const renameBot = useBotStore((s) => s.renameBot);

  const [secretsOpen, setSecretsOpen] = useState(false);

  if (!bot || !flow) {
    return (
      <div className="page">
        <p>Бот не найден.</p>
        <button className="btn" onClick={onBack}>
          ← К списку ботов
        </button>
      </div>
    );
  }

  const addChain = () => {
    const name = prompt('Название цепочки:', 'Новая цепочка');
    if (!name) return;
    const id = addChainFlow(bot.id, name);
    setActiveFlow(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="editor-topbar">
        <button className="btn btn--sm" onClick={onBack}>
          ←
        </button>
        <span
          className="editor-topbar__name"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => renameBot(bot.id, e.currentTarget.textContent)}
        >
          {bot.name}
        </span>

        <select
          className="select editor-topbar__flow-select"
          value={flow.id}
          onChange={(e) => setActiveFlow(e.target.value)}
        >
          {bot.flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.isMain ? '🏠 ' : '🔗 '}
              {f.name}
            </option>
          ))}
        </select>
        <button className="btn btn--sm" onClick={addChain}>
          + Цепочка
        </button>

        <div className="editor-topbar__spacer" />

        <button className="btn btn--sm" onClick={() => setSecretsOpen(true)}>
          🔑 Ключи бота
        </button>
      </div>

      <FlowCanvas bot={bot} flow={flow} />

      {secretsOpen && (
        <Modal title="Ключи бота" onClose={() => setSecretsOpen(false)}>
          <SecretsForm bot={bot} onSave={setBotSecrets} onClose={() => setSecretsOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function SecretsForm({ bot, onSave, onClose }) {
  const [token, setToken] = useState(bot.telegramToken);
  const [groq, setGroq] = useState(bot.groqApiKey);

  return (
    <div>
      <div className="field">
        <span className="field__label">Telegram Bot Token (из @BotFather)</span>
        <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC…" />
      </div>
      <div className="field">
        <span className="field__label">Groq API Key</span>
        <input className="input" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="gsk_…" />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        В MVP ключи хранятся локально в браузере. На бэкенде (Netlify Functions + Supabase) их нужно будет
        шифровать перед сохранением — см. README.
      </p>
      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            onSave(bot.id, { telegramToken: token, groqApiKey: groq });
            onClose();
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
