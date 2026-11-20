import Icon from './Icon.jsx';
import { useState } from 'react';
import Modal from './Modal.jsx';
import SecretsForm from './SecretsForm.jsx';
import { useBotStore } from '../store/useBotStore.js';
import { platformLabel, tokenStatusLabel } from '../lib/platform.js';

export default function FlowListView({ onOpenFlow, onOpenUsers, onOpenChannels, onBack, onOpenBroadcasts }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const setActiveFlow = useBotStore((s) => s.setActiveFlow);
  const addChainFlow = useBotStore((s) => s.addChainFlow);
  const setBotSecrets = useBotStore((s) => s.setBotSecrets);
  const renameBot = useBotStore((s) => s.renameBot);
  const deleteFlow = useBotStore((s) => s.deleteFlow);

  const [secretsOpen, setSecretsOpen] = useState(false);

  if (!bot) {
    return (
      <div className="page">
        <p>Бот не найден.</p>
        <button className="btn" onClick={onBack}>
          <Icon name="arrow-left" gap />К списку ботов
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

  const removeFlow = async (e, f) => {
    e.stopPropagation();
    if (f.isMain) return;
    if (!confirm(`Удалить сценарий «${f.name}» вместе со всеми блоками? Блоки «Цепочка», которые ведут в него, перестанут работать.`)) return;
    const ok = await deleteFlow(bot.id, f.id);
    if (!ok) alert('Не удалось удалить сценарий. Попробуйте ещё раз.');
  };

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        <Icon name="arrow-left" gap />Боты
      </button>

      {bot.status && bot.status !== 'active' && (
        <div className={`bot-banner bot-banner--${bot.status}`}>
          <b>{bot.status === 'frozen' ? 'Бот заморожен администратором.' : 'Бот отключён администратором.'}</b> Он не отвечает пользователям
          {bot.status === 'disabled' ? ', а сценарии нельзя редактировать' : ''}.
          {bot.statusReason && <> Причина: {bot.statusReason}</>}
        </div>
      )}

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
            {platformLabel(bot)} · {tokenStatusLabel(bot)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onOpenUsers}>
            <Icon name="users" gap />Пользователи
          </button>
          <button className="btn" onClick={onOpenBroadcasts}>
            <Icon name="bullhorn" gap />Рассылки
          </button>
          <button className="btn" onClick={onOpenChannels}>
            <Icon name="comments" gap />Группы и каналы
          </button>
          <button className="btn" onClick={() => setSecretsOpen(true)}>
            <Icon name="key" gap />Ключи бота
          </button>
          <button className="btn btn--primary" onClick={addScenario}>
            + Сценарий
          </button>
        </div>
      </div>

      <div className="flow-list">
        {bot.flows.map((f) => (
          <div className="flow-row" key={f.id} onClick={() => openFlow(f.id)}>
            <span className="flow-row__icon"><Icon name={f.isMain ? 'house' : 'link'} /></span>
            <span className="flow-row__name">{f.name}</span>
            {f.isMain && <span className="flow-row__badge">Главный</span>}
            <span className="flow-row__meta">{f.nodes.length} блоков</span>
            {!f.isMain && (
              <button
                className="flow-row__delete"
                onClick={(e) => removeFlow(e, f)}
                title="Удалить сценарий"
                aria-label={`Удалить сценарий ${f.name}`}
              >
                <Icon name="trash" />
              </button>
            )}
            <span className="flow-row__arrow">
              <Icon name="chevron-right" />
            </span>
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
