import { useState } from 'react';
import Modal from './Modal.jsx';
import SecretsForm from './SecretsForm.jsx';
import { useBotStore } from '../store/useBotStore.js';

export default function FlowListView({ onOpenFlow, onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const setActiveFlow = useBotStore((s) => s.setActiveFlow);
  const addChainFlow = useBotStore((s) => s.addChainFlow);
  const setBotSecrets = useBotStore((s) => s.setBotSecrets);
  const renameBot = useBotStore((s) => s.renameBot);

  const [secretsOpen, setSecretsOpen] = useState(false);

  if (!bot) {
    return (
      <div className="page">
        <p>Бот не найден.</p>
        <button className="btn" onClick={onBack}>
          ← К списку ботов
        </button>
      </div>
    );
  }

  const openFlow = (flowId) => {
    setActiveFlow(flowId);
    onOpenFlow();
  };

  const addScenario = async () => {
    const name = prompt('Название сценария:', 'Новый сценарий');
    if (!name) return;
    const id = await addChainFlow(bot.id, name);
    if (id) openFlow(id);
  };

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← Боты
      </button>

      <div className="page__header">
        <div>
          <h1
            className="page__title"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => renameBot(bot.id, e.currentTarget.textContent)}
          >
            {bot.name}
          </h1>
          <p className="page__subtitle">
            {bot.flows.length} {bot.flows.length === 1 ? 'сценарий' : 'сценариев'} ·{' '}
            {bot.telegramToken ? 'токен задан' : 'токен не задан'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setSecretsOpen(true)}>
            🔑 Ключи бота
          </button>
          <button className="btn btn--primary" onClick={addScenario}>
            + Сценарий
          </button>
        </div>
      </div>

      <div className="flow-list">
        {bot.flows.map((f) => (
          <div className="flow-row" key={f.id} onClick={() => openFlow(f.id)}>
            <span className="flow-row__icon">{f.isMain ? '🏠' : '🔗'}</span>
            <span className="flow-row__name">{f.name}</span>
            {f.isMain && <span className="flow-row__badge">Главный</span>}
            <span className="flow-row__meta">{f.nodes.length} блоков</span>
            <span className="flow-row__arrow">→</span>
          </div>
        ))}
      </div>

      {secretsOpen && (
        <Modal title="Ключи бота" onClose={() => setSecretsOpen(false)}>
          <SecretsForm bot={bot} onSave={setBotSecrets} onClose={() => setSecretsOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
