import { useTheme } from '../store/useTheme.js';
import { useAuthStore } from '../store/useAuthStore.js';

export default function TopBar({ view, onNavigate }) {
  const { theme, toggle } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__brand-mark" />
        <span>Flowbase</span>
      </div>
      <div className="topbar__nav">
        <button
          className={`topbar__nav-btn${view === 'bots' || view === 'editor' ? ' is-active' : ''}`}
          onClick={() => onNavigate('bots')}
        >
          Мои боты
        </button>
        <button
          className={`topbar__nav-btn${view === 'templates' ? ' is-active' : ''}`}
          onClick={() => onNavigate('templates')}
        >
          Шаблоны
        </button>
      </div>

      {profile && (
        <div className="topbar__account">
          <span className="topbar__email" title={profile.email}>
            {profile.email}
            {profile.is_admin && <span className="topbar__admin-badge">admin</span>}
          </span>
          <button className="btn btn--sm" onClick={signOut}>
            Выйти
          </button>
        </div>
      )}

      <button className="theme-toggle" onClick={toggle} title="Переключить тему">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
