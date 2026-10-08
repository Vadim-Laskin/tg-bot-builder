import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminListUsers, adminUpdateProfile } from '../../lib/admin.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import Modal from '../Modal.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—');

export default function AdminUsers() {
  const me = useAuthStore((s) => s.profile);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminListUsers();
    if (res.ok) {
      setUsers(res.data);
      setError('');
    } else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => `${u.email} ${u.display_name}`.toLowerCase().includes(q)) : users;
  }, [users, query]);

  return (
    <div>
      <div className="admin-toolbar">
        <input className="input" placeholder="Поиск по email или имени" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--sm" onClick={load} disabled={loading}>
          {loading ? 'Обновляю…' : '↻ Обновить'}
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Боты</th>
              <th>Регистрация</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} onClick={() => setEditing(u)}>
                <td>
                  <div className="admin-cell-title">{u.display_name || u.email}</div>
                  {u.display_name && <div className="admin-cell-sub">{u.email}</div>}
                </td>
                <td>{u.is_admin ? <span className="badge badge--accent">админ</span> : <span className="badge">пользователь</span>}</td>
                <td>{u.blocked ? <span className="badge badge--bad">заблокирован</span> : <span className="badge badge--ok">активен</span>}</td>
                <td>{u.bots_count}</td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-empty">
                  Никого не нашлось
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title="Данные пользователя" onClose={() => setEditing(null)}>
          <UserForm
            user={editing}
            isSelf={editing.id === me?.id}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [note, setNote] = useState(user.admin_note ?? '');
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [blocked, setBlocked] = useState(user.blocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    const res = await adminUpdateProfile({ userId: user.id, displayName, note, isAdmin, blocked });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">Email</span>
        <input className="input" value={user.email ?? ''} disabled />
      </div>
      <div className="field">
        <span className="field__label">Имя</span>
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Как подписать в списке" />
      </div>
      <div className="field">
        <span className="field__label">Роль</span>
        <select className="select" value={isAdmin ? 'admin' : 'user'} onChange={(e) => setIsAdmin(e.target.value === 'admin')} disabled={isSelf}>
          <option value="user">Пользователь</option>
          <option value="admin">Администратор</option>
        </select>
      </div>
      <div className="field">
        <span className="field__label">Статус</span>
        <select className="select" value={blocked ? 'blocked' : 'active'} onChange={(e) => setBlocked(e.target.value === 'blocked')} disabled={isSelf}>
          <option value="active">Активен</option>
          <option value="blocked">Заблокирован (его боты замораживаются)</option>
        </select>
        {isSelf && <small className="admin-hint">Себе роль и статус менять нельзя.</small>}
      </div>
      <div className="field">
        <span className="field__label">Заметка (видна только админам)</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="admin-stubs">
        <button className="btn btn--sm" disabled title="Скоро">
          Сменить email <span className="badge">скоро</span>
        </button>
        <button className="btn btn--sm" disabled title="Скоро">
          Сбросить пароль <span className="badge">скоро</span>
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}
      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
