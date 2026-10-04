import { useEffect, useState } from 'react';
import { connectWebhook as registerWebhook } from '../lib/webhook.js';
import { vkCallbackUrl, vkCheckBot, vkConnectBot, vkVerifyToken } from '../lib/vk.js';
import { isVk } from '../lib/platform.js';

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен — значение можно выделить руками */
    }
  };
  return (
    <div className="vk-copy">
      <span className="vk-copy__label">{label}</span>
      <div className="vk-copy__row">
        <code>{value}</code>
        <button className="btn btn--sm" onClick={copy}>
          {copied ? '✓' : 'Копировать'}
        </button>
      </div>
    </div>
  );
}

export default function SecretsForm({ bot, onSave, onClose }) {
  const vk = isVk(bot);
  const [token, setToken] = useState(vk ? bot.vkToken : bot.telegramToken);
  const [groq, setGroq] = useState(bot.groqApiKey);
  const [saved, setSaved] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null); // { ok, message }
  const [connecting, setConnecting] = useState(false);
  const [checks, setChecks] = useState(null); // результат диагностики VK
  const [checking, setChecking] = useState(false);
  const [confirmation, setConfirmation] = useState(bot.vkConfirmation ?? '');
  const [confirmSaved, setConfirmSaved] = useState(false);

  const secrets = () => (vk ? { vkToken: token, groqApiKey: groq } : { telegramToken: token, groqApiKey: groq });
  const savedToken = vk ? bot.vkToken : bot.telegramToken;

  const save = async () => {
    await onSave(bot.id, secrets());
    setSaved(true);
  };

  const saveConfirmation = async () => {
    await onSave(bot.id, { vkConfirmation: confirmation.trim() });
    setConfirmSaved(true);
  };

  const runCheck = async () => {
    setChecking(true);
    setChecks(null);
    const res = await vkCheckBot(bot.id);
    setChecks(res.ok ? res.checks : [{ ok: false, title: 'Проверка не удалась', hint: res.error }]);
    setChecking(false);
  };

  // у ВК-бота сразу показываем, всё ли подключено, — «молчит» чаще всего из-за прав ключа
  useEffect(() => {
    if (vk && bot.vkToken) runCheck();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          : { ok: false, message: res.error, manual: res.code === 'manual_required' }
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

      {vk && (
        <div style={{ marginTop: 14 }}>
          <button className="btn btn--sm" onClick={runCheck} disabled={checking || !bot.vkToken}>
            {checking ? 'Проверяю…' : '🩺 Проверить подключение'}
          </button>
          {checks && (
            <ul className="vk-checks">
              {checks.map((c, i) => (
                <li key={i} className={c.ok ? 'is-ok' : c.soft ? 'is-warn' : 'is-bad'}>
                  <span>{c.ok ? '✓' : c.soft ? '!' : '✗'}</span>
                  <div>
                    {c.title}
                    {c.hint && <small>{c.hint}</small>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {vk && (
        <details className="vk-manual" open={webhookStatus?.manual || !!bot.vkConfirmation}>
          <summary>Подключить Callback API вручную</summary>
          <p>
            Если автоматическое подключение не проходит (ошибка 1051), сервер добавляется руками. Порядок важен — строку
            подтверждения нужно сохранить здесь <b>до</b> нажатия «Подтвердить» во ВКонтакте.
          </p>
          <ol>
            <li>
              Сообщество → <b>Управление</b> → <b>Работа с API</b> → вкладка <b>Callback API</b>. Версия API — 5.199 (или новее).
            </li>
            <li>Нажмите «Добавить сервер» и вставьте адрес и секретный ключ ниже.</li>
            <li>ВКонтакте покажет «строку, которую должен вернуть сервер» — вставьте её сюда и нажмите «Сохранить строку».</li>
            <li>
              Вернитесь во ВКонтакте → «Подтвердить». Затем во вкладке <b>Типы событий</b> отметьте «Входящее сообщение» и
              «Callback-кнопки».
            </li>
            <li>
              Управление → <b>Сообщения</b> → «Сообщения сообщества» → Включены; в «Настройки для бота» включите «Возможности
              ботов».
            </li>
          </ol>
          <CopyRow label="Адрес сервера" value={vkCallbackUrl(bot.id)} />
          <CopyRow label="Секретный ключ" value={bot.vkSecret || '— не задан: создайте бота заново'} />
          <div className="field" style={{ marginTop: 10 }}>
            <span className="field__label">Строка подтверждения (из ВКонтакте)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={confirmation}
                onChange={(e) => {
                  setConfirmation(e.target.value);
                  setConfirmSaved(false);
                }}
                placeholder="например, a1b2c3d4"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn--sm" onClick={saveConfirmation} disabled={!confirmation.trim()}>
                {confirmSaved ? '✓' : 'Сохранить строку'}
              </button>
            </div>
          </div>
        </details>
      )}

      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
