import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useBotStore } from '../store/useBotStore.js';

export default function BotChannelsView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const [chats, setChats] = useState(null);

  useEffect(() => {
    if (!bot) return;
    load();
  }, [bot?.id]);

  const load = () => {
    supabase
      .from('bot_chats')
      .select('*')
      .eq('bot_id', bot.id)
      .order('last_seen_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('load bot_chats:', error.message);
        setChats(data ?? []);
      });
  };

  const toggle = async (chat) => {
    const next = !chat.is_enabled;
    setChats((cs) => cs.map((c) => (c.chat_id === chat.chat_id ? { ...c, is_enabled: next } : c)));
    const { error } = await supabase
      .from('bot_chats')
      .update({ is_enabled: next })
      .eq('bot_id', bot.id)
      .eq('chat_id', chat.chat_id);
    if (error) {
      console.error('toggle bot_chats:', error.message);
      load(); // revert to the real state on failure
    }
  };

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

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← {bot.name}
      </button>

      <div className="page__header">
        <div>
          <h1 className="page__title">Группы и каналы</h1>
          <p className="page__subtitle">
            Список появляется сам собой — по мере того, как бота добавляют в группы и каналы.
          </p>
        </div>
      </div>

      {chats === null ? (
        <p style={{ color: 'var(--text-dim)' }}>Загрузка…</p>
      ) : chats.length === 0 ? (
        <p style={{ color: 'var(--text-dim)' }}>
          Бот пока никуда не добавлен. Добавьте его в группу или канал в Telegram — он появится здесь.
        </p>
      ) : (
        <div className="flow-list">
          {chats.map((c) => (
            <div className="flow-row" key={c.chat_id} style={{ cursor: 'default' }}>
              <span className="flow-row__icon">{c.type === 'channel' ? '📢' : '👥'}</span>
              <span className="flow-row__name">{c.title || `Чат ${c.chat_id}`}</span>
              <span className="flow-row__meta">{typeLabel(c.type)}</span>
              <label className="switch" title={c.is_enabled ? 'Бот отвечает здесь' : 'Бот отключён здесь'}>
                <input type="checkbox" checked={c.is_enabled} onChange={() => toggle(c)} />
                <span className="switch__track">
                  <span className="switch__thumb" />
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function typeLabel(type) {
  return { group: 'группа', supergroup: 'супергруппа', channel: 'канал' }[type] ?? type;
}
