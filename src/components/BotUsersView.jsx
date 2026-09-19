import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useBotStore } from '../store/useBotStore.js';

export default function BotUsersView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const [users, setUsers] = useState(null); // null = loading
  const [selected, setSelected] = useState(null); // a row from `users`
  const [messages, setMessages] = useState(null);

  useEffect(() => {
    if (!bot) return;
    supabase
      .from('chat_state')
      .select('*')
      .eq('bot_id', bot.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('load chat_state:', error.message);
        setUsers(data ?? []);
      });
  }, [bot?.id]);

  const openUser = (row) => {
    setSelected(row);
    setMessages(null);
    supabase
      .from('chat_messages')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('chat_id', row.chat_id)
      .order('created_at', { ascending: true })
      .limit(300)
      .then(({ data, error }) => {
        if (error) console.error('load chat_messages:', error.message);
        setMessages(data ?? []);
      });
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

  if (selected) {
    return (
      <div className="page">
        <button className="btn btn--sm" onClick={() => setSelected(null)} style={{ marginBottom: 14 }}>
          ← Все пользователи
        </button>

        <div className="page__header">
          <div>
            <h1 className="page__title">{userLabel(selected)}</h1>
            <p className="page__subtitle">
              chat_id: {selected.chat_id} · последняя активность: {formatDate(selected.updated_at)}
            </p>
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-card">
            <div className="profile-card__title">Теги</div>
            {selected.tags?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.tags.map((tagName) => {
                  const def = (bot.tagDefs ?? []).find((t) => t.name === tagName);
                  return (
                    <span
                      key={tagName}
                      className="registry-row__badge"
                      style={{ background: def?.color ?? 'var(--wire-tag)', color: '#fff' }}
                    >
                      {tagName}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="profile-card__empty">Тегов нет</p>
            )}
          </div>

          <div className="profile-card">
            <div className="profile-card__title">Переменные</div>
            {selected.variables && Object.keys(selected.variables).length ? (
              <table className="profile-table">
                <tbody>
                  {Object.entries(selected.variables).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="profile-card__empty">Переменных нет</p>
            )}
          </div>
        </div>

        <div className="profile-card" style={{ marginTop: 16 }}>
          <div className="profile-card__title">История сообщений</div>
          {messages === null ? (
            <p className="profile-card__empty">Загрузка…</p>
          ) : messages.length === 0 ? (
            <p className="profile-card__empty">Сообщений пока нет</p>
          ) : (
            <div className="profile-history">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="test-msg"
                  style={{
                    alignSelf: m.direction === 'in' ? 'flex-end' : 'flex-start',
                    borderLeftColor: m.direction === 'in' ? 'var(--wire-event)' : 'var(--wire-message)'
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </div>
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
          <h1 className="page__title">Пользователи</h1>
          <p className="page__subtitle">Все, кто писал этому боту в личных сообщениях.</p>
        </div>
      </div>

      {users === null ? (
        <p style={{ color: 'var(--text-dim)' }}>Загрузка…</p>
      ) : users.length === 0 ? (
        <p style={{ color: 'var(--text-dim)' }}>Пока никто не писал боту.</p>
      ) : (
        <div className="flow-list">
          {users.map((u) => (
            <div className="flow-row" key={u.chat_id} onClick={() => openUser(u)}>
              <span className="flow-row__icon">👤</span>
              <span className="flow-row__name">{userLabel(u)}</span>
              {u.tags?.length > 0 && <span className="flow-row__badge">{u.tags.length} тег(ов)</span>}
              <span className="flow-row__meta">{formatDate(u.updated_at)}</span>
              <span className="flow-row__arrow">→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function userLabel(row) {
  if (row.display_name) return row.username ? `${row.display_name} (@${row.username})` : row.display_name;
  if (row.username) return `@${row.username}`;
  return `Чат ${row.chat_id}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
