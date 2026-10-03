import { useEffect, useState } from 'react';
import { useBotStore } from '../store/useBotStore.js';
import { STARTER_TEMPLATES } from '../engine/starterTemplates.js';
import { TOKEN_RE, getBotInfo } from '../lib/telegram.js';
import { connectWebhook } from '../lib/webhook.js';
import { vkConnectBot, vkListCommunities, vkVerifyToken } from '../lib/vk.js';
import { VK_APP_ID, loginCommunity, loginWithVk } from '../lib/vkOAuth.js';
import { randomVkSecret } from '../lib/platform.js';
import TgsSticker from './TgsSticker.jsx';

const PLATFORMS = [
  { id: 'telegram', title: 'Telegram', hint: 'Понадобится токен от @BotFather', icon: '✈️', gradient: 'linear-gradient(135deg,#2aabee,#1c8fd0)' },
  { id: 'vk', title: 'ВКонтакте', hint: 'Выберите своё сообщество', icon: '💬', gradient: 'linear-gradient(135deg,#0077ff,#4a9bff)' }
];

const WEBHOOK_LATER = 'Вебхук пока не подключён (это нормально при локальном запуске). Его можно подключить позже: бот → «🔑 Ключи бота».';

// «+ Новый бот»: платформа → (Telegram: токен | ВКонтакте: сообщество) → шаблон.
export default function NewBotWizard({ onClose, onDone }) {
  const bots = useBotStore((s) => s.bots);
  const createBot = useBotStore((s) => s.createBot);
  const applyStarterGraph = useBotStore((s) => s.applyStarterGraph);

  const [step, setStep] = useState('platform'); // 'platform' | 'telegram' | 'vk' | 'template'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // что сейчас делаем (для блокировки кнопок и подписей)
  const [created, setCreated] = useState(null); // { id, name, handle, notes: [] }
  const [applying, setApplying] = useState(null); // id шаблона | 'empty'

  // Telegram
  const [token, setToken] = useState('');
  // ВКонтакте
  const [vkMode, setVkMode] = useState('start'); // 'start' | 'list' | 'manual'
  const [communities, setCommunities] = useState([]);
  const [vkKey, setVkKey] = useState('');

  const locked = !!busy || !!applying;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !locked && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  const goBack = () => {
    setError('');
    if (step === 'vk' && vkMode !== 'start') setVkMode('start');
    else setStep('platform');
  };

  // ---------- Telegram ----------
  const connectTelegram = async () => {
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

    setBusy('telegram');
    const info = await getBotInfo(value);
    if (!info.ok) {
      setError(info.error);
      setBusy(null);
      return;
    }

    const name = info.bot.first_name || info.bot.username || 'Новый бот';
    const id = await createBot(name, { platform: 'telegram', telegramToken: value });
    if (!id) {
      setError('Не удалось создать бота. Попробуйте ещё раз.');
      setBusy(null);
      return;
    }

    // Вебхук подключаем сразу; если не вышло (например, локальный npm run dev),
    // не страшно — это можно сделать позже в «🔑 Ключи бота».
    const wh = await connectWebhook(id);
    setCreated({ id, name, handle: info.bot.username && `@${info.bot.username}`, notes: wh.ok ? [] : [WEBHOOK_LATER] });
    setBusy(null);
    setStep('template');
  };

  // ---------- ВКонтакте ----------
  const loginVk = async () => {
    setError('');
    setBusy('vk-login');
    try {
      const auth = await loginWithVk(); // окно входа открывается синхронно, до любых await
      setBusy('vk-list');
      const res = await vkListCommunities(auth);
      if (!res.ok) throw new Error(res.error);
      if (!res.communities.length) {
        throw new Error('Не нашёл сообществ, где вы администратор. Создайте сообщество во ВКонтакте или подключите его по ключу доступа.');
      }
      setCommunities(res.communities);
      setVkMode('list');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pickCommunity = async (c) => {
    setError('');
    setBusy(`vk-${c.id}`);
    try {
      const { token: key, expiresIn } = await loginCommunity(c.id); // тоже открывает окно синхронно
      await finishVk(key, expiresIn);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const connectVkByKey = async () => {
    const key = vkKey.trim();
    setError('');
    if (!key) return;
    setBusy('vk-manual');
    await finishVk(key, 0);
  };

  // общий хвост обоих способов: проверить ключ → создать бота → подключить Callback API
  const finishVk = async (key, expiresIn) => {
    const verified = await vkVerifyToken(key);
    if (!verified.ok) {
      setError(verified.error);
      setBusy(null);
      return;
    }
    const { group } = verified;
    if (bots.some((b) => b.platform === 'vk' && b.vkGroupId === group.id)) {
      setError(`Сообщество «${group.name}» уже подключено в вашем аккаунте.`);
      setBusy(null);
      return;
    }

    const id = await createBot(group.name, {
      platform: 'vk',
      vkGroupId: group.id,
      vkToken: key,
      vkSecret: randomVkSecret()
    });
    if (!id) {
      setError('Не удалось создать бота. Попробуйте ещё раз.');
      setBusy(null);
      return;
    }

    const notes = [];
    const conn = await vkConnectBot(id);
    if (!conn.ok) notes.push(`Сообщество пока не подключено к боту: ${conn.error} Это можно повторить позже: бот → «🔑 Ключи бота».`);
    else notes.push(...(conn.warnings ?? []));

    if (expiresIn > 0) {
      const hours = Math.max(1, Math.round(expiresIn / 3600));
      notes.push(
        `Ключ, полученный через вход, действует около ${hours} ч. Для постоянной работы создайте бессрочный ключ: сообщество → Управление → Работа с API → Ключи доступа — и вставьте его в «🔑 Ключи бота».`
      );
    }

    setCreated({ id, name: group.name, handle: group.screenName && `@${group.screenName}`, notes });
    setBusy(null);
    setStep('template');
  };

  // ---------- шаблон ----------
  const pick = async (tpl) => {
    if (applying) return;
    setApplying(tpl?.id ?? 'empty');
    if (tpl) await applyStarterGraph(created.id, tpl.build());
    onDone(created.id);
  };

  const showBack = step === 'telegram' || step === 'vk';

  return (
    <div className="wizard" role="dialog" aria-modal="true">
      <div className="wizard__card">
        <button className="wizard__close" onClick={onClose} disabled={locked} aria-label="Закрыть">
          ✕
        </button>

        <div className="wizard__side">
          <TgsSticker />
        </div>

        <div className="wizard__main">
          {showBack && (
            <button className="wizard__back" onClick={goBack} disabled={locked}>
              ← Назад
            </button>
          )}

          {step === 'platform' && (
            <>
              <h2 className="wizard__title">Где будет работать бот?</h2>
              <p className="wizard__subtitle">Сценарии и блоки одни и те же — выберите мессенджер</p>
              <div className="wizard__grid">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    className="tpl-card tpl-card--platform"
                    style={{ background: p.gradient }}
                    onClick={() => {
                      setError('');
                      setStep(p.id);
                    }}
                  >
                    <span className="tpl-card__title">
                      {p.title}
                      <small>{p.hint}</small>
                    </span>
                    <span className="tpl-card__icon" aria-hidden="true">
                      {p.icon}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'telegram' && (
            <>
              <h2 className="wizard__title">Подключите Telegram-бота</h2>
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
                  onKeyDown={(e) => e.key === 'Enter' && !busy && connectTelegram()}
                  placeholder="Токен бота"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={locked}
                />
                {error && <p className="wizard__error">{error}</p>}
                <button className="btn btn--primary wizard__submit" onClick={connectTelegram} disabled={locked || !token.trim()}>
                  {busy === 'telegram' ? 'Подключаю…' : 'Подключить'}
                </button>
              </div>
            </>
          )}

          {step === 'vk' && (
            <>
              <h2 className="wizard__title">Подключите сообщество ВКонтакте</h2>

              {vkMode === 'start' && (
                <>
                  <p className="wizard__subtitle">
                    Бот будет отвечать от имени вашего сообщества. Название возьмём из ВКонтакте автоматически
                  </p>
                  <div className="wizard__form">
                    {VK_APP_ID ? (
                      <button className="btn btn--primary wizard__submit" onClick={loginVk} disabled={locked}>
                        {busy === 'vk-login' ? 'Жду вход в окне ВКонтакте…' : busy === 'vk-list' ? 'Загружаю сообщества…' : 'Выбрать сообщество через ВКонтакте'}
                      </button>
                    ) : (
                      <p className="wizard__hint">
                        Вход через ВКонтакте на этом сайте не настроен (нет <code>VITE_VK_APP_ID</code>) — подключите сообщество по
                        ключу доступа.
                      </p>
                    )}
                    {error && <p className="wizard__error">{error}</p>}
                  </div>
                  <button
                    className="wizard__skip"
                    onClick={() => {
                      setError('');
                      setVkMode('manual');
                    }}
                    disabled={locked}
                  >
                    У меня есть ключ доступа сообщества
                  </button>
                </>
              )}

              {vkMode === 'list' && (
                <>
                  <p className="wizard__subtitle">Выберите сообщество, где вы администратор</p>
                  <div className="vk-list">
                    {communities.map((c) => (
                      <button key={c.id} className="vk-item" onClick={() => pickCommunity(c)} disabled={locked}>
                        {c.photo ? (
                          <img className="vk-item__ava" src={c.photo} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="vk-item__ava vk-item__ava--empty">{c.name.slice(0, 1)}</span>
                        )}
                        <span className="vk-item__text">
                          <span className="vk-item__name">{c.name}</span>
                          <span className="vk-item__sub">@{c.screenName}</span>
                        </span>
                        {busy === `vk-${c.id}` && <span className="vk-item__busy">…</span>}
                      </button>
                    ))}
                  </div>
                  {error && <p className="wizard__error wizard__error--center">{error}</p>}
                  {busy?.startsWith('vk-') && <p className="wizard__hint">Подтвердите доступ в окне ВКонтакте…</p>}
                </>
              )}

              {vkMode === 'manual' && (
                <>
                  <p className="wizard__subtitle">Ключ доступа сообщества — это то, чем бот пишет от его имени</p>
                  <ol className="wizard__steps">
                    <li>Откройте сообщество → <b>Управление</b> → <b>Работа с API</b> → <b>Ключи доступа</b></li>
                    <li>
                      Нажмите «Создать ключ» и отметьте <b>«Сообщения сообщества»</b> и <b>«Управление сообществом»</b>
                    </li>
                    <li>Скопируйте ключ и вставьте ниже</li>
                  </ol>
                  <div className="wizard__form">
                    <input
                      className="input"
                      value={vkKey}
                      onChange={(e) => {
                        setVkKey(e.target.value);
                        setError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !busy && connectVkByKey()}
                      placeholder="Ключ доступа сообщества"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      disabled={locked}
                    />
                    {error && <p className="wizard__error">{error}</p>}
                    <button className="btn btn--primary wizard__submit" onClick={connectVkByKey} disabled={locked || !vkKey.trim()}>
                      {busy === 'vk-manual' ? 'Подключаю…' : 'Подключить'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'template' && (
            <>
              <div className="wizard__chip">
                ✅ {created.name}
                {created.handle && <span> · {created.handle}</span>}
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

              {created.notes.map((n, i) => (
                <p key={i} className="wizard__hint wizard__hint--warn">
                  {n}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
