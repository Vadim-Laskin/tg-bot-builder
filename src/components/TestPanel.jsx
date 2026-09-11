import { useRef, useState } from 'react';
import { runFlow } from '../engine/flowEngine.js';
import { createMockApi } from '../engine/mockApi.js';
import { parseCallbackData } from '../engine/buttonId.js';

export default function TestPanel({ graph, allFlows, onClose }) {
  const [items, setItems] = useState([
    { kind: 'log', text: 'Тестовый чат готов. Отправьте /start или любое сообщение.' }
  ]);
  const [input, setInput] = useState('');
  const contextRef = useRef({ variables: {}, tags: [], chatId: 'preview' });

  const push = (item) => setItems((s) => [...s, item]);

  const makeApi = () =>
    createMockApi({
      onMessage: ({ text: t, buttons }) => push({ kind: 'bot', text: t, buttons }),
      onLog: (t) => push({ kind: 'log', text: t }),
      flows: allFlows
    });

  const send = async (text) => {
    if (!text.trim()) return;
    push({ kind: 'user', text });
    setInput('');

    contextRef.current.lastMessage = text;
    const trigger = text.startsWith('/') ? { type: 'command', value: text } : { type: 'text', value: text };

    await runFlow({ graph, trigger, context: contextRef.current, api: makeApi() });
  };

  const pressButton = async (button) => {
    if (button.kind === 'url') return; // just a link in real Telegram, nothing to simulate

    push({ kind: 'user', text: `▸ ${button.text}` });
    const parsed = parseCallbackData(button.callbackData);
    if (!parsed) {
      push({ kind: 'log', text: 'Эта кнопка ни к чему не подключена.' });
      return;
    }

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
    contextRef.current = { variables: {}, tags: [], chatId: 'preview' };
    setItems([{ kind: 'log', text: 'Контекст сброшен.' }]);
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
        {items.map((it, i) =>
          it.kind === 'log' ? (
            <div className="test-log" key={i}>
              {it.text}
            </div>
          ) : (
            <div
              className="test-msg"
              key={i}
              style={{
                alignSelf: it.kind === 'user' ? 'flex-end' : 'flex-start',
                borderLeftColor: it.kind === 'user' ? 'var(--wire-event)' : 'var(--wire-message)'
              }}
            >
              {it.text}
              {it.buttons?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {it.buttons.map((b, bi) => (
                    <button
                      key={bi}
                      className="test-msg__button"
                      onClick={() => pressButton(b)}
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
