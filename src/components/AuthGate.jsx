import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useBotStore } from '../store/useBotStore.js';
import { useTemplateStore } from '../store/useTemplateStore.js';
import { isSupabaseConfigured } from '../lib/supabaseClient.js';
import AuthForm from './AuthForm.jsx';

export default function AuthGate({ children }) {
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const init = useAuthStore((s) => s.init);
  const fetchBots = useBotStore((s) => s.fetchBots);
  const fetchTemplates = useTemplateStore((s) => s.fetchTemplates);

  useEffect(() => {
    if (isSupabaseConfigured) init();
  }, [init]);

  useEffect(() => {
    if (session) {
      fetchBots();
      fetchTemplates();
    }
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="topbar__brand" style={{ marginBottom: 14 }}>
            <span className="topbar__brand-mark" />
            Flowbase
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
            Supabase не настроен. Скопируйте <code>.env.example</code> в <code>.env</code>, вставьте
            <code> VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code> из Supabase Dashboard →
            Project Settings → API, и перезапустите <code>npm run dev</code>. Не забудьте выполнить
            <code> supabase/schema.sql</code> в SQL Editor проекта.
          </p>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return <div className="auth-loading">Загрузка…</div>;
  }

  if (!session) {
    return <AuthForm />;
  }

  return children;
}
