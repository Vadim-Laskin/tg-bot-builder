import { useRef, useState } from 'react';
import { runFlow } from '../engine/flowEngine.js';
import { createMockApi } from '../engine/mockApi.js';

export default function TestPanel({ graph, allFlows, onClose }) {
  const [items, setItems] = useState([
    { kind: 'log', text: 'Тестовый чат готов. Отправьте /start или любое сообщение.' }
  ]);
  const [input, setInput] = useState('');
  const contextRef = useRef({ variables: {}, tags: [], chatId: 'preview' });

  const push = (item) => setItems((s) => [...s, item]);

  const send = async (text) => {
    if (!text.trim()) return;
    push({ kind: 'user', text });
    setInput('');

    const api = createMockApi({
      onMessage: ({ text: t, buttons }) => push({ kind: 'bot', text: t, buttons }),
      onLog: (t) => push({ kind: 'log', text: t }),
      flows: allFlows
    });

    contextRef.current.lastMessage = text;
    const trigger = text.startsWith('/')
      ? { type: 'command', value: text }
      : { type: 'text', value: text };

    await runFlow({ graph, trigger, context: contextRef.current, api });
  };

  const reset = () => {
    contextRef.current = { variables: {}, tags: [], chatId: 'preview' };
    setItems([{ kind: 'log', text: 'Контекст сброшен.' }]);
  };

  return (
    <div className="test-panel">
      <div className="test-panel__header">
        <span>🧪 Тест флоу</span>
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
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {it.buttons.map((b, bi) => (
                    <span
                      key={bi}
                      style={{
                        fontSize: 11,
                        border: '1px solid var(--border-strong)',
                        borderRadius: 6,
                        padding: '3px 7px'
                      }}
                    >
                      {b.text}
                    </span>
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
