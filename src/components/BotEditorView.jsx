import { useState } from 'react';
import FlowCanvas from './FlowCanvas.jsx';
import Modal from './Modal.jsx';
import { useBotStore } from '../store/useBotStore.js';
import { supabase } from '../lib/supabaseClient.js';

export default function BotEditorView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const flow = useBotStore((s) => s.getActiveFlow());
  const setActiveFlow = useBotStore((s) => s.setActiveFlow);
  const addChainFlow = useBotStore((s) => s.addChainFlow);
  const setBotSecrets = useBotStore((s) => s.setBotSecrets);
  const renameBot = useBotStore((s) => s.renameBot);

  const [secretsOpen, setSecretsOpen] = useState(false);

  if (!bot || !flow) {
    return (
      <div className="page">
        <p>Бот не найден.</p>
        <button className="btn" onClick={onBack}>
          ← К списку ботов
        </button>
      </div>
    );
  }

  const addChain = async () => {
    const name = prompt('Название цепочки:', 'Новая цепочка');
    if (!name) return;
    const id = await addChainFlow(bot.id, name);
    if (id) setActiveFlow(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="editor-topbar">
        <button className="btn btn--sm" onClick={onBack}>
          ←
        </button>
        <span
          className="editor-topbar__name"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => renameBot(bot.id, e.currentTarget.textContent)}
        >
          {bot.name}
        </span>

        <select
          className="select editor-topbar__flow-select"
          value={flow.id}
          onChange={(e) => setActiveFlow(e.target.value)}
        >
          {bot.flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.isMain ? '🏠 ' : '🔗 '}
              {f.name}
            </option>
          ))}
        </select>
        <button className="btn btn--sm" onClick={addChain}>
          + Цепочка
        </button>

        <div className="editor-topbar__spacer" />

        <button className="btn btn--sm" onClick={() => setSecretsOpen(true)}>
          🔑 Ключи бота
        </button>
      </div>

      <FlowCanvas bot={bot} flow={flow} />

      {secretsOpen && (
        <Modal title="Ключи бота" onClose={() => setSecretsOpen(false)}>
          <SecretsForm bot={bot} onSave={setBotSecrets} onClose={() => setSecretsOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function SecretsForm({ bot, onSave, onClose }) {
  const [token, setToken] = useState(bot.telegramToken);
  const [groq, setGroq] = useState(bot.groqApiKey);
  const [saved, setSaved] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null); // { ok, message }
  const [connecting, setConnecting] = useState(false);

  const save = async () => {
    await onSave(bot.id, { telegramToken: token, groqApiKey: groq });
    setSaved(true);
  };

  const connectWebhook = async () => {
    setConnecting(true);
    setWebhookStatus(null);

    // make sure the token typed just now is actually saved before we try
    // to register a webhook for it
    if (token !== bot.telegramToken || groq !== bot.groqApiKey) {
      await onSave(bot.id, { telegramToken: token, groqApiKey: groq });
    }

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const res = await fetch('/.netlify/functions/set-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ botId: bot.id })
      });
      const data = await res.json();

      setWebhookStatus(
        res.ok
          ? { ok: true, message: 'Готово — бот подключён, пишите ему в Telegram.' }
          : { ok: false, message: data.error || data.description || 'Не удалось подключить вебхук.' }
      );
    } catch (e) {
      setWebhookStatus({ ok: false, message: 'Не удалось обратиться к серверу: ' + e.message });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">Telegram Bot Token (из @BotFather)</span>
        <input
          className="input"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
          placeholder="123456:ABC…"
        />
      </div>
      <div className="field">
        <span className="field__label">Groq API Key</span>
        <input
          className="input"
          value={groq}
          onChange={(e) => {
            setGroq(e.target.value);
            setSaved(false);
          }}
          placeholder="gsk_…"
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Ключи хранятся в таблице bots в Supabase, доступ к ним есть только у вас (RLS). Пока без
        шифрования на уровне столбца — для продакшена стоит перевести их в Supabase Vault.
      </p>

      <div className="modal__actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn--sm" onClick={save}>
          {saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
        <button className="btn btn--primary btn--sm" onClick={connectWebhook} disabled={connecting || !token}>
          {connecting ? 'Подключаю…' : '🔌 Подключить вебхук'}
        </button>
      </div>

      {webhookStatus && (
        <p
          style={{
            fontSize: 12,
            marginTop: 10,
            color: webhookStatus.ok ? 'var(--wire-ai)' : 'var(--danger)'
          }}
        >
          {webhookStatus.message}
        </p>
      )}

      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
