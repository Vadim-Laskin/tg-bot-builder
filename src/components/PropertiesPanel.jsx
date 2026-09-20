import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { BLOCK_DEFS } from '../engine/blockDefs.js';
import { BUTTON_STYLES } from '../engine/buttonStyles.js';
import VariableInserter from './VariableInserter.jsx';
import ChipTextarea from './ChipTextarea.jsx';

export default function PropertiesPanel({
  node,
  otherFlows,
  flowNodes,
  variableDefs,
  tagDefs,
  knownChats,
  knownUsers,
  onChange,
  onDelete,
  onCloseMobile
}) {
  const systemPromptRef = useRef(null);
  const userPromptRef = useRef(null);
  const httpUrlRef = useRef(null);
  const httpBodyRef = useRef(null);
  const setVariableValueRef = useRef(null);
  const sendToChatManualRef = useRef(null);

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
            <ChipTextarea value={data.text} onChange={(text) => set({ text })} variableDefs={variableDefs} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14, marginTop: 14 }}>
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={!!data.waitForReply}
              onChange={(e) => set({ waitForReply: e.target.checked })}
            />
            ⏳ Ждать ответ пользователя
          </label>
          {data.waitForReply && (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 10px', lineHeight: 1.4 }}>
                Сценарий остановится здесь и продолжится, как только пользователь напишет что угодно —
                это и запишется в переменную.
              </p>
              <Field label="Записать ответ в переменную">
                <select
                  className="select"
                  value={data.captureVariableId}
                  onChange={(e) => {
                    const v = (variableDefs ?? []).find((x) => x.id === e.target.value);
                    set({
                      captureVariableId: e.target.value,
                      captureVariableName: v?.name ?? '',
                      captureScope: v?.scope ?? 'personal'
                    });
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
            </>
          )}

          <Field label="Расположение кнопок">
            <select
              className="select"
              value={data.buttonsLayout || 'inline'}
              onChange={(e) => set({ buttonsLayout: e.target.value })}
            >
              <option value="inline">Под сообщением</option>
              <option value="keyboard">Под полем ввода (клавиатура)</option>
            </select>
          </Field>
          {data.buttonsLayout === 'keyboard' && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 }}>
              В группах и каналах Telegram такую клавиатуру не показывает — там кнопки автоматически
              станут обычными, под сообщением.
            </p>
          )}
          <ButtonsEditor buttons={data.buttons} onChange={(buttons) => set({ buttons })} layout={data.buttonsLayout || 'inline'} />
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
              ref={systemPromptRef}
              className="textarea"
              value={data.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
            />
          </Field>
          <VariableInserter
            variableDefs={variableDefs}
            targetRef={systemPromptRef}
            value={data.systemPrompt}
            onChange={(systemPrompt) => set({ systemPrompt })}
          />
          <Field label="Промпт пользователя">
            <textarea
              ref={userPromptRef}
              className="textarea"
              value={data.userPrompt}
              onChange={(e) => set({ userPrompt: e.target.value })}
            />
          </Field>
          <VariableInserter
            variableDefs={variableDefs}
            targetRef={userPromptRef}
            value={data.userPrompt}
            onChange={(userPrompt) => set({ userPrompt })}
          />
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

      {node.type === 'sendToChat' && (
        <>
          <Field label="Куда отправить">
            <select
              className="select"
              value={data.targetType}
              onChange={(e) => {
                const targetType = e.target.value;
                // groups/channels can only show inline buttons — reset so a
                // leftover "клавиатура" choice doesn't silently misbehave
                set(targetType === 'group' ? { targetType, buttonsLayout: 'inline' } : { targetType });
              }}
            >
              <option value="group">Группа или канал</option>
              <option value="user">Пользователь</option>
              <option value="variable">Чат из переменной</option>
              <option value="manual">Указать ID вручную</option>
            </select>
          </Field>

          {data.targetType === 'group' && (
            <>
              <Field label="Группа / канал">
                <select
                  className="select"
                  value={data.targetChatId}
                  onChange={(e) => {
                    const c = (knownChats ?? []).find((x) => x.chat_id === e.target.value);
                    set({ targetChatId: e.target.value, targetLabel: c?.title || e.target.value });
                  }}
                >
                  <option value="">— выбрать —</option>
                  {(knownChats ?? []).map((c) => (
                    <option key={c.chat_id} value={c.chat_id}>
                      {c.title || c.chat_id} ({c.type === 'channel' ? 'канал' : 'группа'})
                    </option>
                  ))}
                </select>
              </Field>
              {(knownChats ?? []).length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
                  Список пуст, пока бота никуда не добавили — появится сам собой (см. «💬 Группы и каналы»).
                </p>
              )}
            </>
          )}

          {data.targetType === 'user' && (
            <>
              <Field label="Пользователь">
                <select
                  className="select"
                  value={data.targetChatId}
                  onChange={(e) => {
                    const u = (knownUsers ?? []).find((x) => x.chat_id === e.target.value);
                    const label = u ? (u.display_name || (u.username ? `@${u.username}` : u.chat_id)) : e.target.value;
                    set({ targetChatId: e.target.value, targetLabel: label });
                  }}
                >
                  <option value="">— выбрать —</option>
                  {(knownUsers ?? []).map((u) => (
                    <option key={u.chat_id} value={u.chat_id}>
                      {u.display_name || (u.username ? `@${u.username}` : u.chat_id)}
                    </option>
                  ))}
                </select>
              </Field>
              {(knownUsers ?? []).length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px' }}>
                  Список пуст, пока никто не написал боту в личку — появится сам собой (см. «👥 Пользователи»).
                </p>
              )}
            </>
          )}

          {data.targetType === 'variable' && (
            <>
              <Field label="Переменная с ID чата">
                <select
                  className="select"
                  value={data.targetVariableId}
                  onChange={(e) => {
                    const v = (variableDefs ?? []).find((x) => x.id === e.target.value);
                    set({
                      targetVariableId: e.target.value,
                      targetVariableName: v?.name ?? '',
                      scope: v?.scope ?? 'personal'
                    });
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
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 }}>
                В переменной должен лежать числовой ID чата — например, сохранённый заранее через
                «Изменение переменной» (обычно удобнее для общей/global переменной с ID админ-чата).
              </p>
            </>
          )}

          {data.targetType === 'manual' && (
            <>
              <Field label="ID чата">
                <input
                  ref={sendToChatManualRef}
                  className="input"
                  value={data.targetManual}
                  onChange={(e) => set({ targetManual: e.target.value })}
                  placeholder="например, -1001234567890"
                />
              </Field>
              <VariableInserter
                variableDefs={variableDefs}
                targetRef={sendToChatManualRef}
                value={data.targetManual}
                onChange={(targetManual) => set({ targetManual })}
              />
            </>
          )}

          <Field label="Текст сообщения">
            <ChipTextarea value={data.text} onChange={(text) => set({ text })} variableDefs={variableDefs} />
          </Field>
          {data.targetType === 'group' ? (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 10px', lineHeight: 1.4 }}>
              В группах и каналах кнопки бывают только под сообщением.
            </p>
          ) : (
            <>
              <Field label="Расположение кнопок">
                <select
                  className="select"
                  value={data.buttonsLayout || 'inline'}
                  onChange={(e) => set({ buttonsLayout: e.target.value })}
                >
                  <option value="inline">Под сообщением</option>
                  <option value="keyboard">Под полем ввода (клавиатура)</option>
                </select>
              </Field>
              {data.buttonsLayout === 'keyboard' && data.targetType !== 'user' && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 }}>
                  Клавиатура работает только в личных сообщениях — если получатель окажется группой или
                  каналом, кнопки автоматически не отправятся.
                </p>
              )}
            </>
          )}
          <ButtonsEditor
            buttons={data.buttons}
            onChange={(buttons) => set({ buttons })}
            layout={data.targetType === 'group' ? 'inline' : data.buttonsLayout || 'inline'}
          />
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '10px 0 0', lineHeight: 1.4 }}>
            Этот блок не ждёт нажатия — сценарий сразу идёт дальше. Кнопки здесь работают для того, кто
            получит сообщение: нажатие в их чате продолжит сценарий с того места, куда вы его подключите.
          </p>
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
              <option value="deleteMessage">Удалить сообщение бота</option>
              <option value="deleteUserMessage">Удалить сообщение пользователя</option>
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
                  <input
                    ref={httpUrlRef}
                    className="input"
                    value={data.url}
                    onChange={(e) => set({ url: e.target.value })}
                  />
                </Field>
              </div>
              <VariableInserter
                variableDefs={variableDefs}
                targetRef={httpUrlRef}
                value={data.url}
                onChange={(url) => set({ url })}
              />
              <Field label="Тело запроса (JSON)">
                <textarea
                  ref={httpBodyRef}
                  className="textarea"
                  value={data.body}
                  onChange={(e) => set({ body: e.target.value })}
                />
              </Field>
              <VariableInserter
                variableDefs={variableDefs}
                targetRef={httpBodyRef}
                value={data.body}
                onChange={(body) => set({ body })}
              />
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
          {data.actionType === 'deleteUserMessage' && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, lineHeight: 1.4 }}>
              Удаляет то сообщение, которое пользователь только что прислал (то, из-за которого сценарий
              сюда попал). В личных чатах у бота есть право удалять входящие сообщения; в группах и
              каналах — только если бот администратор с правом удаления сообщений. Если сюда попали не
              из-за нового сообщения (например, по кнопке или таймеру) — удалять нечего, ничего не произойдёт.
            </p>
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
              <option value="chatType">источник сообщения</option>
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
          ) : data.operator === 'chatType' ? (
            <Field label="Сообщение пришло из">
              <select className="select" value={data.value || 'private'} onChange={(e) => set({ value: e.target.value })}>
                <option value="private">Личные сообщения</option>
                <option value="group">Группа</option>
              </select>
            </Field>
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
            <>
              <Field label="Значение">
                <input
                  ref={setVariableValueRef}
                  className="input"
                  value={data.value}
                  onChange={(e) => set({ value: e.target.value })}
                />
              </Field>
              <VariableInserter
                variableDefs={variableDefs}
                targetRef={setVariableValueRef}
                value={data.value}
                onChange={(value) => set({ value })}
              />
            </>
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

function ButtonsEditor({ buttons, onChange, layout = 'inline' }) {
  const update = (i, patch) => {
    const next = buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange(next);
  };
  const remove = (i) => onChange(buttons.filter((_, idx) => idx !== i));
  const add = () => onChange([...buttons, { id: nanoid(6), text: 'Кнопка', kind: 'callback', style: '', newRow: true }]);

  // press-and-hold drag reorder — pointer events so it works the same with
  // mouse and touch (unlike HTML5 drag-and-drop, which touch mostly ignores)
  const rowRefs = useRef([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const draggingRef = useRef(false);

  const startDrag = (i) => (e) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragIndex(i);
    setOverIndex(i);
    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
      let closest = i;
      let closestDist = Infinity;
      rowRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(y - (rect.top + rect.height / 2));
        if (dist < closestDist) {
          closestDist = dist;
          closest = idx;
        }
      });
      setOverIndex(closest);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragIndex((from) => {
        setOverIndex((to) => {
          if (from !== null && to !== null && from !== to) {
            const next = buttons.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            onChange(next);
          }
          return null;
        });
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <Field label="Кнопки">
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-2px 0 8px', lineHeight: 1.4 }}>
        {layout === 'keyboard'
          ? 'Каждая кнопка — со своей точкой на блоке, соедините стрелкой с нужным следующим блоком.'
          : '«Обычная» кнопка появляется на блоке со своей точкой — соедините её стрелкой с нужным следующим блоком. «Ссылка» просто открывает URL и не ветвит сценарий.'}
        {' '}Зажмите ⠿ и потяните, чтобы переставить местами; «в один ряд» — чтобы поставить рядом с предыдущей.
      </p>
      {buttons.map((b, i) => (
        <div
          key={b.id ?? i}
          ref={(el) => (rowRefs.current[i] = el)}
          style={{
            border: `1px solid ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: 8,
            marginBottom: 6,
            opacity: dragIndex === i ? 0.5 : 1,
            background: dragIndex === i ? 'var(--surface-2)' : undefined
          }}
        >
          <div className="button-row">
            <span
              onPointerDown={startDrag(i)}
              style={{ cursor: 'grab', color: 'var(--text-faint)', padding: '0 4px', touchAction: 'none', userSelect: 'none' }}
              title="Зажать и перетащить"
            >
              ⠿
            </span>
            {i > 0 && (
              <button
                className="btn btn--sm"
                style={{ fontSize: 10, padding: '4px 6px', whiteSpace: 'nowrap' }}
                onClick={() => update(i, { newRow: b.newRow === false ? true : false })}
                title="Переключить: в новой строке / в один ряд с предыдущей"
              >
                {b.newRow === false ? '↔ в один ряд' : '↵ с новой строки'}
              </button>
            )}
            <input
              className="input"
              style={{ flex: 1 }}
              value={b.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="Текст кнопки"
            />
            {layout !== 'keyboard' && (
              <select
                className="select"
                style={{ width: 110 }}
                value={b.kind === 'url' ? 'url' : 'callback'}
                onChange={(e) => update(i, { kind: e.target.value })}
              >
                <option value="callback">Обычная</option>
                <option value="url">Ссылка</option>
              </select>
            )}
            <button className="btn btn--sm btn--danger" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
          {layout !== 'keyboard' && b.kind === 'url' && (
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={b.url ?? ''}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://…"
            />
          )}
          <div className="color-swatches" style={{ marginTop: 8 }}>
            {BUTTON_STYLES.map((s) => (
              <button
                key={s.value}
                className={`color-swatch${(b.style || '') === s.value ? ' is-selected' : ''}`}
                style={
                  s.color
                    ? { background: s.color }
                    : { background: 'var(--surface-3)', border: '1px dashed var(--border-strong)' }
                }
                onClick={() => update(i, { style: s.value })}
                title={`${s.label} — реальный цвет кнопки в Telegram`}
              />
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn--sm" onClick={add}>
        + Кнопка
      </button>
    </Field>
  );
}
