import { useBotStore } from '../store/useBotStore.js';

export default function BotList({ onOpenBot }) {
  const bots = useBotStore((s) => s.bots);
  const createBot = useBotStore((s) => s.createBot);
  const deleteBot = useBotStore((s) => s.deleteBot);
  const setActiveBot = useBotStore((s) => s.setActiveBot);

  const handleCreate = () => {
    const name = prompt('Название бота:', 'Мой бот');
    if (!name) return;
    const id = createBot(name);
    setActiveBot(id);
    onOpenBot();
  };

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
        <div className="bot-card bot-card--new" onClick={handleCreate}>
          + Новый бот
        </div>
        {bots.map((bot) => (
          <div className="bot-card" key={bot.id} onClick={() => open(bot.id)}>
            <div className="bot-card__name">{bot.name}</div>
            <div className="bot-card__meta">
              {bot.flows.length} флоу · {bot.telegramToken ? 'токен задан' : 'токен не задан'}
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
    </div>
  );
}
