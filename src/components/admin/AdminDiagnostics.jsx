import { useState } from 'react';
import { adminDiagnostics } from '../../lib/admin.js';

const Row = ({ ok, label, value, soft }) => (
  <li className={ok ? 'is-ok' : soft ? 'is-warn' : 'is-bad'}>
    <span>{ok ? '✓' : soft ? '!' : '✗'}</span>
    <div>
      {label}
      {value != null && <small>{value}</small>}
    </div>
  </li>
);

export default function AdminDiagnostics() {
  const [state, setState] = useState({ loading: false, data: null, error: '' });

  const run = async () => {
    setState({ loading: true, data: null, error: '' });
    const res = await adminDiagnostics();
    setState({ loading: false, data: res.ok ? res.data : null, error: res.ok ? '' : res.error });
  };

  const d = state.data;
  return (
    <div>
      <div className="admin-toolbar">
        <button className="btn btn--primary btn--sm" onClick={run} disabled={state.loading}>
          {state.loading ? 'Проверяю…' : '▶ Запустить диагностику'}
        </button>
        {d && <span className="admin-hint">Сайт: {d.site ?? '—'} · {new Date(d.time).toLocaleTimeString('ru-RU')}</span>}
      </div>

      {state.error && <p className="admin-error">{state.error}</p>}

      {d && (
        <div className="admin-cards">
          <div className="admin-card">
            <h3>Переменные на Netlify</h3>
            <ul className="vk-checks">
              {Object.entries(d.env).map(([k, v]) => (
                <Row key={k} ok={v} soft={k === 'VK_SERVICE_KEY' || k === 'VITE_VK_APP_ID'} label={k} value={v ? 'задана' : 'не задана'} />
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <h3>База данных</h3>
            {d.db.ok ? (
              <ul className="vk-checks">
                <Row ok label="Подключение" value={`${d.db.ms} мс`} />
                <Row ok label="Пользователей" value={`${d.db.users} (админов: ${d.db.admins}, заблокировано: ${d.db.blockedUsers})`} />
                <Row ok label="Ботов" value={`${d.db.bots.total} · ${Object.entries(d.db.bots.byPlatform).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}`} />
                <Row
                  ok
                  label="Статусы ботов"
                  value={Object.entries(d.db.bots.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}
                />
                <Row ok={d.db.bots.withoutToken === 0} soft label="Ботов без токена" value={d.db.bots.withoutToken} />
                <Row ok label="Шаблонов" value={d.db.templates} />
              </ul>
            ) : (
              <p className="admin-error">{d.db.error}</p>
            )}
          </div>

          <div className="admin-card">
            <h3>Внешние API</h3>
            <ul className="vk-checks">
              <Row ok={d.external.telegram.ok} label="Telegram Bot API" value={d.external.telegram.ok ? `${d.external.telegram.ms} мс` : d.external.telegram.error} />
              <Row ok={d.external.vk.ok} label="ВКонтакте API" value={d.external.vk.ok ? `${d.external.vk.ms} мс` : d.external.vk.error} />
            </ul>
          </div>

          <div className="admin-card admin-card--stub">
            <h3>Скоро</h3>
            <ul className="admin-soon">
              <li>Журнал ошибок вебхуков <span className="badge">скоро</span></li>
              <li>Нагрузка и количество сообщений <span className="badge">скоро</span></li>
              <li>Алерты при падении бота <span className="badge">скоро</span></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
