import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useBotStore } from '../store/useBotStore.js';
import { broadcastCancel, broadcastPreview, broadcastStart, broadcastStep } from '../lib/broadcast.js';

const STATUS = {
  sending: { label: 'отправляется', cls: 'badge--warn' },
  done: { label: 'завершена', cls: 'badge--ok' },
  cancelled: { label: 'остановлена', cls: 'badge--bad' }
};

const fmt = (d) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function BotBroadcastsView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [audience, setAudience] = useState('all');
  const [tag, setTag] = useState('');
  const [count, setCount] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null); // рассылка, которую сейчас отправляем
  const stop = useRef(false);

  const tags = [...new Set((bot?.tagDefs ?? []).map((t) => t.name))];
  const inactive = bot && bot.status !== 'active';
  const hasToken = bot && (bot.platform === 'vk' ? bot.vkToken : bot.telegramToken);

  const load = useCallback(async () => {
    const { data } = await supabase.from('broadcasts').select('*').eq('bot_id', bot.id).order('created_at', { ascending: false }).limit(30);
    setList(data ?? []);
  }, [bot?.id]);

  useEffect(() => {
    if (bot) load();
    return () => {
      stop.current = true; // ушли с экрана — отправка продолжится по кнопке «Продолжить»
    };
  }, [bot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // сколько человек получит рассылку
  useEffect(() => {
    if (!bot || (audience === 'tag' && !tag)) return setCount(null);
    let cancelled = false;
    setCount(null);
    broadcastPreview(bot.id, audience, tag).then((r) => !cancelled && setCount(r.ok ? r.count : null));
    return () => {
      cancelled = true;
    };
  }, [bot?.id, audience, tag]);

  const run = async (b) => {
    stop.current = false;
    setActive(b);
    let cur = b;
    while (cur.status === 'sending' && !stop.current) {
      const r = await broadcastStep(cur.id);
      if (!r.ok) {
        setError(r.error);
        break;
      }
      cur = r.broadcast;
      setActive(cur);
    }
    setActive(null);
    load();
  };

  const start = async () => {
    setError('');
    if (!confirm(`Отправить рассылку ${count ?? ''} получателям? Отменить уже доставленные сообщения нельзя.`)) return;
    setBusy(true);
    const r = await broadcastStart(bot.id, text, audience, tag);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setText('');
    run(r.broadcast);
  };

  const cancel = async (b) => {
    stop.current = true;
    await broadcastCancel(b.id);
    setActive(null);
    load();
  };

  if (!bot) {
    return (
      <div className="page">
        <p>Бот не найден.</p>
        <button className="btn" onClick={onBack}>← К списку ботов</button>
      </div>
    );
  }

  return (
    <div className="page">
      <button className="btn btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>← {bot.name}</button>
      <div className="page__header">
        <div>
          <h1 className="page__title">Рассылки</h1>
          <p className="page__subtitle">Получают только люди, которые писали боту в личные сообщения. Группы, беседы и каналы не входят.</p>
        </div>
      </div>

      <div className="admin-card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <div className="field">
          <span className="field__label">Кому</span>
          <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">Всем, кто писал боту</option>
            <option value="tag">Только с тегом…</option>
          </select>
        </div>
        {audience === 'tag' && (
          <div className="field">
            <span className="field__label">Тег</span>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">— выберите —</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {tags.length === 0 && <small className="admin-hint">В этом боте пока нет тегов (создаются блоком «Тег»).</small>}
          </div>
        )}
        <div className="field">
          <span className="field__label">Текст сообщения</span>
          <textarea className="textarea" rows={5} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Привет! У нас новость…" />
          {bot.platform !== 'vk' && <small className="admin-hint">Можно **жирный**, *курсив*, [ссылка](https://…).</small>}
        </div>

        <p className="admin-hint" style={{ marginBottom: 10 }}>
          Получателей: <b>{count ?? '…'}</b>
        </p>
        {inactive && <p className="admin-error">Бот заморожен или отключён администратором — рассылка недоступна.</p>}
        {!hasToken && <p className="admin-error">У бота не задан токен/ключ.</p>}
        {error && <p className="admin-error">{error}</p>}

        {active ? (
          <div>
            <div className="bcast-bar"><div style={{ width: `${Math.round(((active.sent + active.failed) / Math.max(active.total, 1)) * 100)}%` }} /></div>
            <p className="admin-hint">Отправлено {active.sent} из {active.total}{active.failed ? `, не доставлено ${active.failed}` : ''}. Не закрывайте страницу.</p>
            <button className="btn btn--sm btn--danger" onClick={() => cancel(active)}>Остановить</button>
          </div>
        ) : (
          <button className="btn btn--primary" onClick={start} disabled={busy || inactive || !hasToken || !text.trim() || !count || (audience === 'tag' && !tag)}>
            {busy ? 'Готовлю…' : '📢 Отправить рассылку'}
          </button>
        )}
      </div>

      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: '0 0 10px' }}>История</h3>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table--static">
          <thead>
            <tr><th>Рассылка</th><th>Кому</th><th>Статус</th><th>Доставлено</th><th /></tr>
          </thead>
          <tbody>
            {(list ?? []).map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="admin-cell-title">{b.text.slice(0, 70)}{b.text.length > 70 ? '…' : ''}</div>
                  <div className="admin-cell-sub">{fmt(b.created_at)}</div>
                </td>
                <td>{b.audience === 'tag' ? `тег «${b.tag}»` : 'все'}</td>
                <td><span className={`badge ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span></td>
                <td>{b.sent} / {b.total}{b.failed ? <span className="admin-cell-sub"> · ошибок {b.failed}</span> : null}</td>
                <td>
                  {b.status === 'sending' && !active && (
                    <button className="btn btn--sm" onClick={() => run(b)}>Продолжить</button>
                  )}
                </td>
              </tr>
            ))}
            {list && list.length === 0 && <tr><td colSpan={5} className="admin-empty">Рассылок ещё не было</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
