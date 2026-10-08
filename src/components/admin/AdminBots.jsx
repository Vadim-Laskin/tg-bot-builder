import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminListBots, adminSetBotStatus } from '../../lib/admin.js';

const STATUS = {
  active: { label: 'работает', cls: 'badge--ok' },
  frozen: { label: 'заморожен', cls: 'badge--warn' },
  disabled: { label: 'отключён', cls: 'badge--bad' }
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—');

export default function AdminBots() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminListBots();
    if (res.ok) {
      setBots(res.data);
      setError('');
    } else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bots.filter(
      (b) => (filter === 'all' || b.status === filter) && (!q || `${b.name} ${b.owner_email}`.toLowerCase().includes(q))
    );
  }, [bots, query, filter]);

  const setStatus = async (bot, status) => {
    let reason = '';
    if (status !== 'active') {
      const answer = window.prompt(
        `${status === 'frozen' ? 'Заморозить' : 'Отключить'} «${bot.name}». Причина (её увидит владелец):`,
        bot.status_reason || ''
      );
      if (answer === null) return;
      reason = answer.trim();
    }
    setBusyId(bot.id);
    const res = await adminSetBotStatus(bot.id, status, reason);
    setBusyId(null);
    if (!res.ok) return setError(res.error);
    load();
  };

  return (
    <div>
      <p className="admin-hint" style={{ marginBottom: 12 }}>
        <b>Заморожен</b> — бот молчит, владелец может править сценарий. <b>Отключён</b> — бот молчит, владелец не может ни
        править его, ни включить.
      </p>

      <div className="admin-toolbar">
        <input className="input" placeholder="Поиск по названию или владельцу" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Работают</option>
          <option value="frozen">Заморожены</option>
          <option value="disabled">Отключены</option>
        </select>
        <button className="btn btn--sm" onClick={load} disabled={loading}>
          {loading ? 'Обновляю…' : '↻ Обновить'}
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--static">
          <thead>
            <tr>
              <th>Бот</th>
              <th>Владелец</th>
              <th>Статус</th>
              <th>Токен</th>
              <th>Создан</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const st = STATUS[b.status] ?? STATUS.active;
              return (
                <tr key={b.id}>
                  <td>
                    <div className="admin-cell-title">{b.name}</div>
                    <div className="admin-cell-sub">
                      {b.platform === 'vk' ? 'ВКонтакте' : 'Telegram'} · сценариев: {b.flows_count}
                    </div>
                  </td>
                  <td>{b.owner_email ?? '—'}</td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {b.status_reason && <div className="admin-cell-sub">{b.status_reason}</div>}
                  </td>
                  <td>{b.has_token ? '✓' : <span className="badge badge--warn">нет</span>}</td>
                  <td>{fmtDate(b.created_at)}</td>
                  <td>
                    <div className="admin-actions">
                      {b.status !== 'active' && (
                        <button className="btn btn--sm" disabled={busyId === b.id} onClick={() => setStatus(b, 'active')}>
                          Включить
                        </button>
                      )}
                      {b.status !== 'frozen' && (
                        <button className="btn btn--sm" disabled={busyId === b.id} onClick={() => setStatus(b, 'frozen')}>
                          Заморозить
                        </button>
                      )}
                      {b.status !== 'disabled' && (
                        <button className="btn btn--sm btn--danger" disabled={busyId === b.id} onClick={() => setStatus(b, 'disabled')}>
                          Отключить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-empty">
                  Ботов не нашлось
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
