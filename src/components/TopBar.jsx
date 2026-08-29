import { useTheme } from '../store/useTheme.js';

export default function TopBar({ view, onNavigate }) {
  const { theme, toggle } = useTheme();

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__brand-mark" />
        Flowbase
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
      <button className="theme-toggle" onClick={toggle} title="Переключить тему">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
