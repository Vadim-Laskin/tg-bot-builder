import { useState } from 'react';
import { useBotStore } from '../store/useBotStore.js';
import { platformLabel, tokenStatusLabel } from '../lib/platform.js';
import NewBotWizard from './NewBotWizard.jsx';

export default function BotList({ onOpenBot }) {
  const bots = useBotStore((s) => s.bots);
  const deleteBot = useBotStore((s) => s.deleteBot);
  const setActiveBot = useBotStore((s) => s.setActiveBot);

  const [wizardOpen, setWizardOpen] = useState(false);

  const open = (id) => {
    setActiveBot(id);
    onOpenBot();
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Мои боты</h1>
          <p className="page__subtitle">Ботов можно создать сколько угодно — лимита нет.</p>
        </div>
      </div>

      <div className="bot-grid">
        <div className="bot-card bot-card--new" onClick={() => setWizardOpen(true)}>
          + Новый бот
        </div>
        {bots.map((bot) => (
          <div className="bot-card" key={bot.id} onClick={() => open(bot.id)}>
            <div className="bot-card__name">
              {bot.name}
              {bot.status === 'frozen' && <span className="badge badge--warn" style={{ marginLeft: 8 }}>заморожен</span>}
              {bot.status === 'disabled' && <span className="badge badge--bad" style={{ marginLeft: 8 }}>отключён</span>}
            </div>
            <div className="bot-card__meta">
              {bot.flows.length} {bot.flows.length === 1 ? 'сценарий' : 'сценариев'} ·{' '}
              {platformLabel(bot)} · {tokenStatusLabel(bot)}
            </div>
            <div className="bot-card__actions">
              <button
                className="btn btn--sm btn--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить бота «${bot.name}»?`)) deleteBot(bot.id);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>

      {wizardOpen && (
        <NewBotWizard
          onClose={() => setWizardOpen(false)}
          onDone={(id) => {
            setWizardOpen(false);
            open(id);
          }}
        />
      )}
    </div>
  );
}
