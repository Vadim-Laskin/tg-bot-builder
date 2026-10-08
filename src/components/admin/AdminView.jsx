import { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import AdminUsers from './AdminUsers.jsx';
import AdminBots from './AdminBots.jsx';
import AdminDiagnostics from './AdminDiagnostics.jsx';
import AdminTemplates from './AdminTemplates.jsx';

const TABS = [
  { id: 'users', label: '👥 Пользователи' },
  { id: 'bots', label: '🤖 Боты' },
  { id: 'templates', label: '📋 Шаблоны' },
  { id: 'diagnostics', label: '🩺 Диагностика' }
];

export default function AdminView({ onBack }) {
  const profile = useAuthStore((s) => s.profile);
  const [tab, setTab] = useState('users');

  // это лишь скрытие экрана; настоящая защита — в функциях и политиках базы
  if (!profile?.is_admin) {
    return (
      <div className="page">
        <p style={{ color: 'var(--text-dim)' }}>Раздел только для администраторов.</p>
        <button className="btn btn--sm" onClick={onBack}>
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Админка</h1>
          <p className="page__subtitle">Пользователи, боты, шаблоны и состояние сервиса</p>
        </div>
      </div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`admin-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <AdminUsers />}
      {tab === 'bots' && <AdminBots />}
      {tab === 'templates' && <AdminTemplates />}
      {tab === 'diagnostics' && <AdminDiagnostics />}
    </div>
  );
}
