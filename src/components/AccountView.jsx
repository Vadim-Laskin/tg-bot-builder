import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { supabase } from '../lib/supabaseClient.js';

export default function AccountView({ onBack }) {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null); // { ok, message }
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    setStatus(null);
    if (password.length < 6) {
      setStatus({ ok: false, message: 'Пароль должен быть не короче 6 символов.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ ok: false, message: 'Пароли не совпадают.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setStatus({ ok: false, message: error.message });
      return;
    }
    setPassword('');
    setConfirm('');
    setStatus({ ok: true, message: 'Пароль обновлён.' });
  };

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← Назад
      </button>

      <div className="page__header">
        <div>
          <h1 className="page__title">Настройки аккаунта</h1>
          <p className="page__subtitle">{profile?.email}</p>
        </div>
      </div>

      <div style={{ maxWidth: 360 }}>
        <div className="field">
          <span className="field__label">Email</span>
          <input className="input" value={profile?.email ?? ''} disabled />
        </div>

        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: '20px 0 12px' }}>Сменить пароль</h3>
        <div className="field">
          <span className="field__label">Новый пароль</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 6 символов"
          />
        </div>
        <div className="field">
          <span className="field__label">Повторите пароль</span>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        <button className="btn btn--primary btn--sm" onClick={changePassword} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сменить пароль'}
        </button>

        {status && (
          <p style={{ fontSize: 12, marginTop: 10, color: status.ok ? 'var(--wire-ai)' : 'var(--danger)' }}>
            {status.message}
          </p>
        )}

        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: '28px 0 12px' }}>Аккаунт</h3>
        <button className="btn btn--danger btn--sm" onClick={signOut}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
