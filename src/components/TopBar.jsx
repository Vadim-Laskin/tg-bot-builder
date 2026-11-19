import Icon from './Icon.jsx';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../store/useTheme.js';
import { useAuthStore } from '../store/useAuthStore.js';

export default function TopBar({ view, onNavigate }) {
  const { theme, toggle } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // закрываем меню по клику снаружи и по Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (target) => {
    setOpen(false);
    onNavigate(target);
  };

  const initial = (profile?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__brand-mark" />
        <span>Chateon</span>
      </div>
      <div className="topbar__nav">
        <button
          className={`topbar__nav-btn${['bots', 'flows', 'editor'].includes(view) ? ' is-active' : ''}`}
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
        {profile?.is_admin && (
          <button
            className={`topbar__nav-btn${view === 'admin' ? ' is-active' : ''}`}
            onClick={() => onNavigate('admin')}
          >
            Админка
          </button>
        )}
      </div>

      {profile && (
        <div className="usermenu" ref={menuRef}>
          <button
            className={`usermenu__trigger${['account', 'settings'].includes(view) ? ' is-active' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            title={profile.email}
          >
            <span className="usermenu__avatar">{initial}</span>
            <span className="usermenu__chevron" aria-hidden="true">
              <Icon name="chevron-down" />
            </span>
          </button>

          {open && (
            <div className="usermenu__panel" role="menu">
              <div className="usermenu__head">
                <span className="usermenu__avatar usermenu__avatar--lg">{initial}</span>
                <div className="usermenu__who">
                  <span className="usermenu__email" title={profile.email}>
                    {profile.email}
                  </span>
                  <span className="usermenu__role">{profile.is_admin ? 'Администратор' : 'Пользователь'}</span>
                </div>
              </div>

              <button className="usermenu__item" role="menuitem" onClick={() => go('account')}>
                <span className="usermenu__icon">
                  <Icon name="user" />
                </span>Профиль
              </button>
              <button className="usermenu__item" role="menuitem" onClick={() => go('settings')}>
                <span className="usermenu__icon">
                  <Icon name="gear" />
                </span>Настройки
              </button>
              <button className="usermenu__item" role="menuitem" onClick={toggle}>
                <span className="usermenu__icon">
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                </span>
                {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              </button>

              <div className="usermenu__sep" />
              <button className="usermenu__item usermenu__item--danger" role="menuitem" onClick={signOut}>
                <span className="usermenu__icon">
                  <Icon name="right-from-bracket" />
                </span>Выйти
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
