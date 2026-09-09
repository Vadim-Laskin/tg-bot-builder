import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function AuthForm() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === 'signup') setInfo('Готово! Если в проекте включено подтверждение почты — проверьте письмо.');
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="topbar__brand" style={{ marginBottom: 22 }}>
          <span className="topbar__brand-mark" />
          Flowbase
        </div>

        <div className="field">
          <span className="field__label">Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <span className="field__label">Пароль</span>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}

        <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Секунду…' : mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
        </button>
        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError('');
            setInfo('');
          }}
        >
          {mode === 'signin' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  );
}
