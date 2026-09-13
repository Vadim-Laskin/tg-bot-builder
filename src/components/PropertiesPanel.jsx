import { nanoid } from 'nanoid';
import { BLOCK_DEFS } from '../engine/blockDefs.js';

export default function PropertiesPanel({ node, otherFlows, flowNodes, variableDefs, tagDefs, onChange, onDelete, onCloseMobile }) {
  if (!node) {
    return (
      <aside className="properties">
        <div className="properties__empty">
          Выберите блок на холсте,
          <br />
          чтобы настроить его здесь.
        </div>
      </aside>
    );
  }

  const def = BLOCK_DEFS[node.type];
  const data = node.data;
  const set = (patch) => onChange({ ...data, ...patch });

  return (
    <aside className="properties is-open">
      <div className="properties__mobile-header">
        <span>Свойства блока</span>
        <button className="btn btn--sm" onClick={onCloseMobile}>
          Готово
        </button>
      </div>
      <div className="properties__title">
        <span className="node__dot" style={{ background: def.color }} />
        {def.label}
      </div>
      <div className="properties__type">id: {node.id}</div>

      {node.type === 'note' && (
        <Field label="Текст заметки">
          <textarea className="textarea" value={data.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      )}

      {node.type === 'event' && (
        <>
          <Field label="Тип триггера">
            <select
              className="select"
              value={data.triggerType}
              onChange={(e) => set({ triggerType: e.target.value })}
            >
              <option value="command">Команда (/start)</option>
              <option value="text">Любой текст</option>
              <option value="schedule">По расписанию</option>
            </select>
          </Field>
          {data.triggerType !== 'schedule' && (
            <Field label="Значение">
              <input className="input" value={data.value} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {node.type === 'message' && (
        <>
          <Field label="Текст сообщения">
            <textarea className="textarea" value={data.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={!!data.editPrevious}
              onChange={(e) => set({ editPrevious: e.target.checked })}
            />
            ✏️ Редактировать предыдущее сообщение (если сюда попали по кнопке)
          </label>
          {data.editPrevious && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 }}>
              Как в меню других ботов: нажатие кнопки меняет текст и кнопки того же сообщения вместо
              отправки нового. Если сюда попали не по кнопке (например, по /start) — отправится новое.
            </p>
          )}
          <ButtonsEditor buttons={data.buttons} onChange={(buttons) => set({ buttons })} />
        </>
      )}

      {node.type === 'aiMessage' && (
        <>
          <Field label="Модель Groq">
            <select className="select" value={data.model} onChange={(e) => set({ model: e.target.value })}>
              <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (мощнее)</option>
              <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (быстрее)</option>
              <option value="qwen/qwen3.6-27b">qwen/qwen3.6-27b</option>
            </select>
          </Field>
          <Field label="Системный промпт">
            <textarea
              className="textarea"
              value={data.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
            />
          </Field>
          <Field label="Промпт пользователя">
            <textarea
              className="textarea"
              value={data.userPrompt}
              onChange={(e) => set({ userPrompt: e.target.value })}
            />
          </Field>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 }}>
            Если в промпте есть ссылка (http…) — её содержимое подгрузится и передастся ИИ автоматически.
          </p>
          <Field label="Сохранить ответ в переменную (необязательно)">
            <input className="input" value={data.saveTo} onChange={(e) => set({ saveTo: e.target.value })} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={!!data.editPrevious}
              onChange={(e) => set({ editPrevious: e.target.checked })}
            />
            ✏️ Редактировать предыдущее сообщение (если сюда попали по кнопке)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={!!data.allowButtons}
              onChange={(e) => set({ allowButtons: e.target.checked })}
            />
            🔘 Разрешить ИИ самому предлагать кнопки с вариантами ответа
          </label>
          {data.allowButtons && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.4 }}>
              ИИ сам решает, когда это уместно (до 4 вариантов). Нажатие такой кнопки — как если бы
              пользователь сам напечатал этот вариант, и сценарий продолжится дальше от этого блока.
            </p>
          )}
        </>
      )}

      {node.type === 'action' && (
        <>
          <Field label="Тип действия">
            <select
              className="select"
              value={data.actionType}
              onChange={(e) => set({ actionType: e.target.value })}
            >
              <option value="http">HTTP-запрос</option>
              <option value="typing">Индикатор «печатает»</option>
              <option value="delay">Пауза (мс)</option>
              <option value="deleteMessage">Удалить сообщение</option>
            </select>
          </Field>
          {data.actionType === 'http' && (
            <>
              <div className="properties__row">
                <Field label="Метод">
                  <select className="select" value={data.method} onChange={(e) => set({ method: e.target.value })}>
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                  </select>
                </Field>
                <Field label="URL">
                  <input className="input" value={data.url} onChange={(e) => set({ url: e.target.value })} />
                </Field>
              </div>
              <Field label="Тело запроса (JSON)">
                <textarea className="textarea" value={data.body} onChange={(e) => set({ body: e.target.value })} />
              </Field>
            </>
          )}
          {data.actionType === 'delay' && (
            <Field label="Миллисекунды">
              <input className="input" value={data.value ?? ''} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
          {data.actionType === 'deleteMessage' && (
            <>
              <Field label="Какое сообщение удалить">
                <select
                  className="select"
                  value={data.targetNodeId ?? ''}
                  onChange={(e) => set({ targetNodeId: e.target.value })}
                >
                  <option value="">— выбрать блок —</option>
                  {(flowNodes ?? [])
                    .filter((n) => (n.type === 'message' || n.type === 'aiMessage') && n.id !== node.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {messageNodeLabel(n)}
                      </option>
                    ))}
                </select>
              </Field>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 0', lineHeight: 1.4 }}>
                Удаляет то сообщение, которое отправил выбранный блок, у текущего пользователя. Если
                этому пользователю тот блок ещё не отправлял сообщение — действие ничего не сделает.
              </p>
            </>
          )}
        </>
      )}

      {node.type === 'condition' && (
        <>
          <Field label="Оператор">
            <select className="select" value={data.operator} onChange={(e) => set({ operator: e.target.value })}>
              <option value="equals">равно</option>
              <option value="notEquals">не равно</option>
              <option value="contains">содержит</option>
              <option value="greaterThan">больше</option>
              <option value="lessThan">меньше</option>
              <option value="hasTag">есть тег</option>
              <option value="notHasTag">нет тега</option>
            </select>
          </Field>

          {data.operator === 'hasTag' || data.operator === 'notHasTag' ? (
            <>
              <Field label="Тег">
                <select
                  className="select"
                  value={data.tagId}
                  onChange={(e) => {
                    const t = (tagDefs ?? []).find((x) => x.id === e.target.value);
                    set({ tagId: e.target.value, tagName: t?.name ?? '', scope: t?.scope ?? 'personal' });
                  }}
                >
                  <option value="">— выбрать —</option>
                  {(tagDefs ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.scope === 'global' ? 'общий' : 'личный'})
                    </option>
                  ))}
                </select>
              </Field>
              {(tagDefs ?? []).length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
                  Тегов пока нет — создайте через «🏷 Теги» в шапке редактора.
                </p>
              )}
            </>
          ) : (
            <>
              <Field label="Переменная">
                <select
                  className="select"
                  value={data.variableId}
                  onChange={(e) => {
                    const v = (variableDefs ?? []).find((x) => x.id === e.target.value);
                    set({ variableId: e.target.value, variableName: v?.name ?? '', scope: v?.scope ?? 'personal' });
                  }}
                >
                  <option value="">— выбрать —</option>
                  {(variableDefs ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.scope === 'global' ? 'общая' : 'личная'})
                    </option>
                  ))}
                </select>
              </Field>
              {(variableDefs ?? []).length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
                  Переменных пока нет — создайте через «🔢 Переменные» в шапке редактора.
                </p>
              )}
              <Field label="Значение">
                <input className="input" value={data.value} onChange={(e) => set({ value: e.target.value })} />
              </Field>
            </>
          )}
        </>
      )}

      {node.type === 'chain' && (
        <Field label="Какую цепочку вызвать">
          <select
            className="select"
            value={data.flowId}
            onChange={(e) => {
              const flow = otherFlows.find((f) => f.id === e.target.value);
              set({ flowId: e.target.value, flowName: flow?.name ?? '' });
            }}
          >
            <option value="">— выбрать —</option>
            {otherFlows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {node.type === 'setVariable' && (
        <>
          <Field label="Переменная">
            <select
              className="select"
              value={data.variableId}
              onChange={(e) => {
                const v = (variableDefs ?? []).find((x) => x.id === e.target.value);
                set({ variableId: e.target.value, variableName: v?.name ?? '', scope: v?.scope ?? 'personal' });
              }}
            >
              <option value="">— выбрать —</option>
              {(variableDefs ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.scope === 'global' ? 'общая' : 'личная'})
                </option>
              ))}
            </select>
          </Field>
          {(variableDefs ?? []).length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
              Переменных пока нет — создайте через «🔢 Переменные» в шапке редактора.
            </p>
          )}
          <Field label="Операция">
            <select className="select" value={data.op} onChange={(e) => set({ op: e.target.value })}>
              <option value="set">установить</option>
              <option value="increment">увеличить на</option>
              <option value="clear">очистить</option>
            </select>
          </Field>
          {data.op !== 'clear' && (
            <Field label="Значение">
              <input className="input" value={data.value} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {node.type === 'setTag' && (
        <>
          <Field label="Тег">
            <select
              className="select"
              value={data.tagId}
              onChange={(e) => {
                const t = (tagDefs ?? []).find((x) => x.id === e.target.value);
                set({ tagId: e.target.value, tagName: t?.name ?? '', color: t?.color ?? '', scope: t?.scope ?? 'personal' });
              }}
            >
              <option value="">— выбрать —</option>
              {(tagDefs ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.scope === 'global' ? 'общий' : 'личный'})
                </option>
              ))}
            </select>
          </Field>
          {(tagDefs ?? []).length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
              Тегов пока нет — создайте через «🏷 Теги» в шапке редактора.
            </p>
          )}
          <Field label="Операция">
            <select className="select" value={data.op} onChange={(e) => set({ op: e.target.value })}>
              <option value="add">добавить</option>
              <option value="remove">убрать</option>
            </select>
          </Field>
        </>
      )}

      <button className="btn btn--danger btn--sm" style={{ marginTop: 12 }} onClick={onDelete}>
        Удалить блок
      </button>
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {children}
    </div>
  );
}

function messageNodeLabel(n) {
  const raw = n.type === 'aiMessage' ? n.data.userPrompt : n.data.text;
  const preview = (raw || '').trim().slice(0, 28) || '(пусто)';
  const icon = n.type === 'aiMessage' ? '🤖' : '💬';
  return `${icon} ${preview}`;
}

function ButtonsEditor({ buttons, onChange }) {
  const update = (i, patch) => {
    const next = buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange(next);
  };
  const remove = (i) => onChange(buttons.filter((_, idx) => idx !== i));
  const add = () => onChange([...buttons, { id: nanoid(6), text: 'Кнопка', kind: 'callback' }]);

  return (
    <Field label="Кнопки">
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-2px 0 8px', lineHeight: 1.4 }}>
        «Обычная» кнопка появляется на блоке со своей точкой — соедините её стрелкой с
        нужным следующим блоком. «Ссылка» просто открывает URL и не ветвит сценарий.
      </p>
      {buttons.map((b, i) => (
        <div key={b.id ?? i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <div className="button-row">
            <input
              className="input"
              style={{ flex: 1 }}
              value={b.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="Текст кнопки"
            />
            <select
              className="select"
              style={{ width: 110 }}
              value={b.kind === 'url' ? 'url' : 'callback'}
              onChange={(e) => update(i, { kind: e.target.value })}
            >
              <option value="callback">Обычная</option>
              <option value="url">Ссылка</option>
            </select>
            <button className="btn btn--sm btn--danger" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
          {b.kind === 'url' && (
            <input
              className="input"
              value={b.url ?? ''}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://…"
            />
          )}
        </div>
      ))}
      <button className="btn btn--sm" onClick={add}>
        + Кнопка
      </button>
    </Field>
  );
}
