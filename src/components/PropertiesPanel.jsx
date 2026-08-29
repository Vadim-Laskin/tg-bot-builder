import { BLOCK_DEFS } from '../engine/blockDefs.js';

export default function PropertiesPanel({ node, otherFlows, onChange, onDelete, onCloseMobile }) {
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
              <option value="callback">Нажатие кнопки</option>
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
          <ButtonsEditor buttons={data.buttons} onChange={(buttons) => set({ buttons })} />
        </>
      )}

      {node.type === 'aiMessage' && (
        <>
          <Field label="Модель Groq">
            <select className="select" value={data.model} onChange={(e) => set({ model: e.target.value })}>
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
              <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
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
          <Field label="Сохранить ответ в переменную (необязательно)">
            <input className="input" value={data.saveTo} onChange={(e) => set({ saveTo: e.target.value })} />
          </Field>
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
        </>
      )}

      {node.type === 'condition' && (
        <>
          <Field label="Переменная">
            <input className="input" value={data.variable} onChange={(e) => set({ variable: e.target.value })} />
          </Field>
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
          <Field label="Значение">
            <input className="input" value={data.value} onChange={(e) => set({ value: e.target.value })} />
          </Field>
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
          <Field label="Имя переменной">
            <input className="input" value={data.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
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
            <input className="input" value={data.tag} onChange={(e) => set({ tag: e.target.value })} />
          </Field>
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

function ButtonsEditor({ buttons, onChange }) {
  const update = (i, patch) => {
    const next = buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange(next);
  };
  const remove = (i) => onChange(buttons.filter((_, idx) => idx !== i));
  const add = () => onChange([...buttons, { text: 'Кнопка', action: 'next', value: '' }]);

  return (
    <Field label="Кнопки">
      {buttons.map((b, i) => (
        <div className="button-row" key={i}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={b.text}
            onChange={(e) => update(i, { text: e.target.value })}
          />
          <button className="btn btn--sm btn--danger" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn btn--sm" onClick={add}>
        + Кнопка
      </button>
    </Field>
  );
}
