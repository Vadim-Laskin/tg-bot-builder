import { useEffect, useState } from 'react';
import { useBotStore } from '../store/useBotStore.js';
import { STARTER_TEMPLATES } from '../engine/starterTemplates.js';
import { TOKEN_RE, getBotInfo } from '../lib/telegram.js';
import { connectWebhook } from '../lib/webhook.js';
import TgsSticker from './TgsSticker.jsx';

// «+ Новый бот»: шаг 1 — токен (имя бота берём из Telegram),
// шаг 2 — выбор шаблона или пустой сценарий.
export default function NewBotWizard({ onClose, onDone }) {
  const bots = useBotStore((s) => s.bots);
  const createBot = useBotStore((s) => s.createBot);
  const applyStarterGraph = useBotStore((s) => s.applyStarterGraph);

  const [step, setStep] = useState('token'); // 'token' | 'template'
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { id, name, username, webhookOk }
  const [applying, setApplying] = useState(null); // template id | 'empty'

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && !applying && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, applying, onClose]);

  const connect = async () => {
    const value = token.trim();
    setError('');
    if (!TOKEN_RE.test(value)) {
      setError('Токен выглядит как 123456789:AAH… — скопируйте его из сообщения BotFather целиком.');
      return;
    }
    if (bots.some((b) => b.telegramToken === value)) {
      setError('Этот бот уже подключён в вашем аккаунте.');
      return;
    }

    setBusy(true);
    const info = await getBotInfo(value);
    if (!info.ok) {
      setError(info.error);
      setBusy(false);
      return;
    }

    const name = info.bot.first_name || info.bot.username || 'Новый бот';
    const id = await createBot(name, value);
    if (!id) {
      setError('Не удалось создать бота. Попробуйте ещё раз.');
      setBusy(false);
      return;
    }

    // Вебхук подключаем сразу; если не вышло (например, локальный npm run dev),
    // не страшно — это можно сделать позже в «🔑 Ключи бота».
    const wh = await connectWebhook(id);
    setCreated({ id, name, username: info.bot.username, webhookOk: wh.ok });
    setBusy(false);
    setStep('template');
  };

  const pick = async (tpl) => {
    if (applying) return;
    setApplying(tpl?.id ?? 'empty');
    if (tpl) await applyStarterGraph(created.id, tpl.build());
    onDone(created.id);
  };

  return (
    <div className="wizard" role="dialog" aria-modal="true">
      <div className="wizard__card">
        <button className="wizard__close" onClick={onClose} disabled={busy || !!applying} aria-label="Закрыть">
          ✕
        </button>

        <div className="wizard__side">
          <TgsSticker />
        </div>

        <div className="wizard__main">
          {step === 'token' ? (
            <>
              <h2 className="wizard__title">Подключите вашего бота</h2>
              <p className="wizard__subtitle">Название бота мы возьмём из Telegram автоматически</p>

              <ol className="wizard__steps">
                <li>
                  Откройте <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> в Telegram
                </li>
                <li>
                  Отправьте <code>/newbot</code>, придумайте название и username (он должен оканчиваться на <code>bot</code>)
                </li>
                <li>BotFather пришлёт токен вида <code>123456789:AAH…</code> — скопируйте его</li>
                <li>Вставьте токен ниже</li>
              </ol>
              <p className="wizard__hint">
                Бот уже есть? Отправьте BotFather <code>/mybots</code> → выберите бота → API Token.
              </p>

              <div className="wizard__form">
                <input
                  className="input"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && connect()}
                  placeholder="Токен бота"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={busy}
                />
                {error && <p className="wizard__error">{error}</p>}
                <button className="btn btn--primary wizard__submit" onClick={connect} disabled={busy || !token.trim()}>
                  {busy ? 'Подключаю…' : 'Подключить'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="wizard__chip">
                ✅ {created.name}
                {created.username && <span> · @{created.username}</span>}
              </div>
              <h2 className="wizard__title">Выберите шаблон для чат-бота</h2>
              <p className="wizard__subtitle">
                Мы преднастроим его, чтобы вы смогли быстро попробовать нужный функционал
              </p>

              <div className="wizard__grid">
                {STARTER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    className={`tpl-card${applying === tpl.id ? ' is-busy' : ''}`}
                    style={{ background: tpl.gradient }}
                    onClick={() => pick(tpl)}
                    disabled={!!applying}
                  >
                    <span className="tpl-card__title">{tpl.title}</span>
                    <span className="tpl-card__icon" aria-hidden="true">
                      {tpl.icon}
                    </span>
                  </button>
                ))}
              </div>

              <button className="wizard__skip" onClick={() => pick(null)} disabled={!!applying}>
                {applying === 'empty' ? 'Открываю…' : 'Продолжить с пустым сценарием'}
              </button>

              {!created.webhookOk && (
                <p className="wizard__hint wizard__hint--warn">
                  Вебхук пока не подключён (это нормально при локальном запуске). Его можно подключить позже:
                  бот → «🔑 Ключи бота».
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
