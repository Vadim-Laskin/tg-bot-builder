import { useRef, useState } from 'react';
import { runFlow } from '../engine/flowEngine.js';
import { createMockApi } from '../engine/mockApi.js';
import { parseCallbackData } from '../engine/buttonId.js';
import { formatMessageText } from '../engine/formatText.js';

let itemSeq = 0;
const nextItemId = () => `item-${++itemSeq}`;

export default function TestPanel({ graph, allFlows, onClose }) {
  const [items, setItems] = useState([
    { id: nextItemId(), kind: 'log', text: 'Тестовый чат готов. Отправьте /start или любое сообщение.' }
  ]);
  const [input, setInput] = useState('');
  const contextRef = useRef({ variables: {}, tags: [], globalVariables: {}, globalTags: [], chatId: 'preview' });

  const push = (item) => setItems((s) => [...s, { id: nextItemId(), ...item }]);

  const makeApi = () =>
    createMockApi({
      onMessage: ({ id, text: t, buttons }) => setItems((s) => [...s, { id, kind: 'bot', text: t, buttons }]),
      onEditMessage: (messageId, { text: t, buttons }) => {
        let found = false;
        setItems((s) =>
          s.map((it) => {
            if (it.id !== messageId || it.kind !== 'bot') return it;
            found = true;
            return { ...it, text: t, buttons };
          })
        );
        return found;
      },
      onDeleteMessage: (messageId) => setItems((s) => s.filter((it) => it.id !== messageId)),
      onLog: (t) => push({ kind: 'log', text: t }),
      flows: allFlows
    });

  const send = async (text) => {
    if (!text.trim()) return;
    push({ kind: 'user', text });
    setInput('');

    contextRef.current.lastMessage = text;
    contextRef.current.sourceMessageId = undefined; // plain text/command — no message to edit
    const trigger = text.startsWith('/') ? { type: 'command', value: text } : { type: 'text', value: text };

    await runFlow({ graph, trigger, context: contextRef.current, api: makeApi() });
  };

  const pressButton = async (item, button) => {
    if (button.kind === 'url') return; // just a link in real Telegram, nothing to simulate

    push({ kind: 'user', text: `▸ ${button.text}` });
    const parsed = parseCallbackData(button.callbackData);
    if (!parsed) {
      push({ kind: 'log', text: 'Эта кнопка ни к чему не подключена.' });
      return;
    }

    contextRef.current.sourceMessageId = item.id; // lets "Редактировать предыдущее" find this bubble

    // only works if the target block lives in the scenario currently open
    // on the canvas — if it's in a different scenario (chain), open that
    // one to test it, the real bot always resolves this correctly
    await runFlow({
      graph,
      trigger: { type: 'resume', nodeId: parsed.nodeId, handle: `btn-${parsed.buttonId}` },
      context: contextRef.current,
      api: makeApi()
    });
  };

  const reset = () => {
    contextRef.current = { variables: {}, tags: [], globalVariables: {}, globalTags: [], chatId: 'preview' };
    setItems([{ id: nextItemId(), kind: 'log', text: 'Контекст сброшен.' }]);
  };

  return (
    <div className="test-panel">
      <div className="test-panel__header">
        <span>🧪 Тест сценария</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn--sm" onClick={reset}>
            Сброс
          </button>
          <button className="btn btn--sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <div className="test-panel__body">
        {items.map((it) =>
          it.kind === 'log' ? (
            <div className="test-log" key={it.id}>
              {it.text}
            </div>
          ) : (
            <div
              className="test-msg"
              key={it.id}
              style={{
                alignSelf: it.kind === 'user' ? 'flex-end' : 'flex-start',
                borderLeftColor: it.kind === 'user' ? 'var(--wire-event)' : 'var(--wire-message)'
              }}
            >
              {it.kind === 'bot' ? (
                <span dangerouslySetInnerHTML={{ __html: formatMessageText(it.text) }} />
              ) : (
                it.text
              )}
              {it.buttons?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {it.buttons.map((b, bi) => (
                    <button
                      key={bi}
                      className="test-msg__button"
                      onClick={() => pressButton(it, b)}
                      title={b.kind === 'url' ? b.url : 'Нажать (тест)'}
                    >
                      {b.kind === 'url' ? '🔗 ' : ''}
                      {b.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
      <div className="test-panel__footer">
        <input
          className="input"
          placeholder="/start или сообщение…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
        />
        <button className="btn btn--primary btn--sm" onClick={() => send(input)}>
          →
        </button>
      </div>
    </div>
  );
}
