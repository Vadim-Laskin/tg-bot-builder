import { useTheme } from '../store/useTheme.js';

const THEMES = [
  { value: 'dark', label: 'Тёмная', hint: 'Спокойнее для глаз вечером' },
  { value: 'light', label: 'Светлая', hint: 'Светлый интерфейс для дня' }
];

export default function SettingsView({ onBack }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← Назад
      </button>

      <div className="page__header">
        <div>
          <h1 className="page__title">Настройки</h1>
          <p className="page__subtitle">Оформление сервиса. Хранится в этом браузере.</p>
        </div>
      </div>

      <div style={{ maxWidth: 460 }}>
        <span className="field__label">Тема оформления</span>
        <div className="theme-choice" role="radiogroup" aria-label="Тема оформления">
          {THEMES.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={theme === t.value}
              className={`theme-choice__card${theme === t.value ? ' is-selected' : ''}`}
              onClick={() => setTheme(t.value)}
            >
              <span className={`theme-choice__preview theme-choice__preview--${t.value}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="theme-choice__label">{t.label}</span>
              <span className="theme-choice__hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
