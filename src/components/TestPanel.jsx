import { useRef, useState } from 'react';
import { runFlow } from '../engine/flowEngine.js';
import { createMockApi } from '../engine/mockApi.js';
import { parseCallbackData } from '../engine/buttonId.js';
import { formatMessageText } from '../engine/formatText.js';
import { groupButtonsIntoRows } from '../engine/buttonLayout.js';

let itemSeq = 0;
const nextItemId = () => `item-${++itemSeq}`;

export default function TestPanel({ graph, allFlows, onClose }) {
  const [items, setItems] = useState([
    { id: nextItemId(), kind: 'log', text: 'Тестовый чат готов. Отправьте /start или любое сообщение.' }
  ]);
  const [input, setInput] = useState('');
  const [chatKind, setChatKind] = useState('private'); // simulated source for the "источник сообщения" condition
  const contextRef = useRef({
    variables: {},
    tags: [],
    globalVariables: {},
    globalTags: [],
    pendingKeyboard: {},
    chatId: 'preview',
    chatType: 'private'
  });

  const push = (item) => setItems((s) => [...s, { id: nextItemId(), ...item }]);

  const makeApi = () =>
    createMockApi({
      onMessage: ({ id, text: t, buttons, toOtherChat, chatId }) =>
        setItems((s) => [...s, { id, kind: 'bot', text: t, buttons, toOtherChat, chatId }]),
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
      flows: allFlows,
      ownChatId: contextRef.current.chatId
    });

  const send = async (text) => {
    if (!text.trim()) return;
    push({ kind: 'user', text });
    setInput('');

    contextRef.current.lastMessage = text;
    contextRef.current.sourceMessageId = undefined; // plain text/command — no message to edit

    let trigger;
    const pending = contextRef.current.pendingKeyboard?.[text];
    if (!text.startsWith('/') && pending) {
      // matches a currently-shown "under keyboard" button by its text,
      // same as the real bot does — resumes like any other button press
      trigger = { type: 'resume', nodeId: pending.nodeId, handle: `btn-${pending.buttonId}` };
    } else {
      trigger = text.startsWith('/') ? { type: 'command', value: text } : { type: 'text', value: text };
    }

    await runFlow({ graph, trigger, context: contextRef.current, api: makeApi() });
  };

  const pressButton = async (item, button) => {
    if (button.kind === 'url') return; // just a link in real Telegram, nothing to simulate

    push({ kind: 'user', text: `▸ ${button.text}` });

    if (button.kind === 'keyboard') {
      const target = contextRef.current.pendingKeyboard?.[button.text];
      if (!target) {
        push({ kind: 'log', text: 'Эта кнопка клавиатуры устарела (её заменили новой).' });
        return;
      }
      await runFlow({
        graph,
        trigger: { type: 'resume', nodeId: target.nodeId, handle: `btn-${target.buttonId}` },
        context: contextRef.current,
        api: makeApi()
      });
      return;
    }

    const parsed = parseCallbackData(button.callbackData);
    if (!parsed) {
      push({ kind: 'log', text: 'Эта кнопка ни к чему не подключена.' });
      return;
    }

    const quickReplyMatch = /^c(\d+)$/.exec(parsed.buttonId);
    let trigger;
    if (quickReplyMatch) {
      // AI-generated quick-reply button — resume past that block's normal
      // output, with lastMessage set to the picked option
      const choices = contextRef.current.pendingChoices?.[parsed.nodeId] ?? [];
      const chosen = choices[Number(quickReplyMatch[1])];
      contextRef.current.lastMessage = chosen ?? button.text;
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: 'default' };
    } else {
      trigger = { type: 'resume', nodeId: parsed.nodeId, handle: `btn-${parsed.buttonId}` };
    }

    contextRef.current.sourceMessageId = item.id; // lets "Редактировать предыдущее" find this bubble

    // only works if the target block lives in the scenario currently open
    // on the canvas — if it's in a different scenario (chain), open that
    // one to test it, the real bot always resolves this correctly
    await runFlow({ graph, trigger, context: contextRef.current, api: makeApi() });
  };

  const toggleChatKind = () => {
    setChatKind((k) => {
      const next = k === 'private' ? 'group' : 'private';
      contextRef.current.chatType = next;
      return next;
    });
  };

  const reset = () => {
    contextRef.current = {
      variables: {},
      tags: [],
      globalVariables: {},
      globalTags: [],
      pendingKeyboard: {},
      chatId: 'preview',
      chatType: chatKind
    };
    setItems([{ id: nextItemId(), kind: 'log', text: 'Контекст сброшен.' }]);
  };

  return (
    <div className="test-panel">
      <div className="test-panel__header">
        <span>🧪 Тест сценария</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn--sm" onClick={toggleChatKind} title="Откуда как будто пришло сообщение">
            {chatKind === 'private' ? '👤 Личка' : '👥 Группа'}
          </button>
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
              {it.toOtherChat && (
                <div style={{ fontSize: 10, color: 'var(--wire-broadcast)', marginBottom: 3, fontWeight: 700 }}>
                  → в чат {it.chatId}
                </div>
              )}
              {it.kind === 'bot' ? (
                <span dangerouslySetInnerHTML={{ __html: formatMessageText(it.text) }} />
              ) : (
                it.text
              )}
              {it.buttons?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {groupButtonsIntoRows(it.buttons).map((row, ri) => (
                    <div key={ri} style={{ display: 'flex', gap: 4 }}>
                      {row.map((b) => {
                        const bi = it.buttons.indexOf(b);
                        return (
                          <button
                            key={bi}
                            className="test-msg__button"
                            style={{ flex: 1 }}
                            onClick={() => pressButton(it, b)}
                            title={b.kind === 'url' ? b.url : 'Нажать (тест)'}
                          >
                            {b.kind === 'url' ? '🔗 ' : b.kind === 'keyboard' ? '⌨️ ' : ''}
                            {b.text}
                          </button>
                        );
                      })}
                    </div>
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
