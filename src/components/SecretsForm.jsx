import { useState } from 'react';
import { connectWebhook as registerWebhook } from '../lib/webhook.js';
import { vkConnectBot, vkVerifyToken } from '../lib/vk.js';
import { isVk } from '../lib/platform.js';

export default function SecretsForm({ bot, onSave, onClose }) {
  const vk = isVk(bot);
  const [token, setToken] = useState(vk ? bot.vkToken : bot.telegramToken);
  const [groq, setGroq] = useState(bot.groqApiKey);
  const [saved, setSaved] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null); // { ok, message }
  const [connecting, setConnecting] = useState(false);

  const secrets = () => (vk ? { vkToken: token, groqApiKey: groq } : { telegramToken: token, groqApiKey: groq });
  const savedToken = vk ? bot.vkToken : bot.telegramToken;

  const save = async () => {
    await onSave(bot.id, secrets());
    setSaved(true);
  };

  const connectWebhook = async () => {
    setConnecting(true);
    setWebhookStatus(null);

    if (vk) {
      // ключ мог поменяться на ключ другого сообщества — берём id сообщества из самого ключа
      const verified = await vkVerifyToken(token.trim());
      if (!verified.ok) {
        setWebhookStatus({ ok: false, message: verified.error });
        setConnecting(false);
        return;
      }
      await onSave(bot.id, { ...secrets(), vkToken: token.trim(), vkGroupId: verified.group.id });
      const res = await vkConnectBot(bot.id);
      setWebhookStatus(
        res.ok
          ? { ok: true, message: ['Готово — сообщество подключено, напишите ему во ВКонтакте.', ...(res.warnings ?? [])].join(' ') }
          : { ok: false, message: res.error }
      );
      setConnecting(false);
      return;
    }

    // make sure the token typed just now is actually saved before we try
    // to register a webhook for it
    if (token !== savedToken || groq !== bot.groqApiKey) {
      await onSave(bot.id, secrets());
    }

    setWebhookStatus(await registerWebhook(bot.id));
    setConnecting(false);
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">
          {vk ? 'Ключ доступа сообщества ВКонтакте' : 'Telegram Bot Token (из @BotFather)'}
        </span>
        <input
          className="input"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
          placeholder={vk ? 'vk1.a.…' : '123456:ABC…'}
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
          {connecting ? 'Подключаю…' : vk ? '🔌 Подключить сообщество' : '🔌 Подключить вебхук'}
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
