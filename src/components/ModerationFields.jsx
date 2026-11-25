// Настройки блока «Модерация» и события «Проверка сообщений» в панели свойств.

import { eventChecks, DEFAULT_MODERATION_MODEL } from '../engine/moderation.js';

export const MODERATION_ACTIONS = {
  warn: 'Предупреждение',
  resetWarns: 'Снять предупреждения',
  mute: 'Мут (запретить писать)',
  unmute: 'Снять мут',
  kick: 'Удалить из группы / канала',
  ban: 'Бан',
  unban: 'Разбан',
  delete: 'Удалить сообщение'
};

const hint = { fontSize: 11, color: 'var(--text-faint)', margin: '-8px 0 14px', lineHeight: 1.4 };
const check = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 };

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {children}
    </div>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <label style={check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function ViolationFields({ data, set }) {
  const checks = eventChecks(data);
  return (
    <>
      <p style={{ ...hint, margin: '0 0 12px' }}>
        Срабатывает, когда сообщение участника группы нарушает выбранное. Такое сообщение не запускает другие
        события. Бот должен быть администратором группы.
      </p>
      <Checkbox checked={checks.profanity} onChange={(v) => set({ checkProfanity: v })}>
        Мат
      </Checkbox>
      <Checkbox checked={checks.insults} onChange={(v) => set({ checkInsults: v })}>
        Оскорбления и угрозы
      </Checkbox>
      <Checkbox checked={checks.spam} onChange={(v) => set({ checkSpam: v })}>
        Спам, реклама, мошенничество
      </Checkbox>
      <Checkbox checked={checks.links} onChange={(v) => set({ checkLinks: v })}>
        Любые ссылки
      </Checkbox>
      <Field label="Своё правило (необязательно)">
        <textarea
          className="textarea"
          value={data.customRule ?? ''}
          placeholder="например: нельзя обсуждать политику"
          onChange={(e) => set({ customRule: e.target.value })}
        />
      </Field>
      <Field label="Модель Groq">
        <select className="select" value={data.model || DEFAULT_MODERATION_MODEL} onChange={(e) => set({ model: e.target.value })}>
          <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (быстрее)</option>
          <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (точнее)</option>
        </select>
      </Field>
      <p style={hint}>
        Ссылки и явный мат определяются без ИИ, остальное — через Groq (нужен ключ в «Ключах бота»). В панели
        «Тест» ИИ не вызывается.
      </p>
      <Checkbox checked={data.ignoreAdmins ?? true} onChange={(v) => set({ ignoreAdmins: v })}>
        Не проверять администраторов
      </Checkbox>
    </>
  );
}

export default function ModerationFields({ data, set, knownChats }) {
  const action = data.action || 'mute';
  const target = data.target || 'sender';
  const hasDuration = action === 'mute' || action === 'ban' || (action === 'warn' && data.limitAction !== 'kick');

  return (
    <>
      <Field label="Действие">
        <select className="select" value={action} onChange={(e) => set({ action: e.target.value })}>
          {Object.entries(MODERATION_ACTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label={action === 'delete' ? 'Чьё сообщение' : 'Кого'}>
        <select className="select" value={target} onChange={(e) => set({ target: e.target.value })}>
          <option value="sender">Отправителя сообщения</option>
          <option value="reply">Того, на чьё сообщение ответили</option>
          {action !== 'delete' && <option value="manual">Указать ID пользователя</option>}
        </select>
      </Field>
      {target === 'reply' && (
        <p style={hint}>Команду пишут ответом на сообщение участника. Можно и с ID: «/unban 123456789».</p>
      )}
      {target === 'manual' && (
        <Field label="ID пользователя">
          <input
            className="input"
            value={data.targetManual ?? ''}
            placeholder="123456789 или {{переменная}}"
            onChange={(e) => set({ targetManual: e.target.value })}
          />
        </Field>
      )}

      {action !== 'delete' && (
        <>
          <Field label="Где">
            <select className="select" value={data.chatSource || 'current'} onChange={(e) => set({ chatSource: e.target.value })}>
              <option value="current">В этом чате</option>
              <option value="chosen">В выбранной группе / канале</option>
            </select>
          </Field>
          {data.chatSource === 'chosen' && (
            <Field label="Группа / канал">
              <select
                className="select"
                value={data.targetChatId ?? ''}
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
          )}
        </>
      )}

      {action === 'warn' && (
        <>
          <Field label="Сколько предупреждений до наказания">
            <input
              className="input"
              type="number"
              min="1"
              value={data.warnLimit ?? 3}
              onChange={(e) => set({ warnLimit: e.target.value })}
            />
          </Field>
          <Field label="Наказание после лимита">
            <select className="select" value={data.limitAction || 'mute'} onChange={(e) => set({ limitAction: e.target.value })}>
              <option value="mute">Мут</option>
              <option value="kick">Удалить из группы</option>
              <option value="ban">Бан</option>
            </select>
          </Field>
        </>
      )}

      {hasDuration && (
        <>
          <Field label="Срок">
            <input
              className="input"
              value={data.duration ?? ''}
              placeholder="30, 2ч, 1д — пусто: навсегда"
              onChange={(e) => set({ duration: e.target.value })}
            />
          </Field>
          <Checkbox checked={data.durationFromCommand !== false} onChange={(v) => set({ durationFromCommand: v })}>
            Брать срок из команды («/mute 2ч»), если указан
          </Checkbox>
        </>
      )}

      {action !== 'delete' && target !== 'manual' && (
        <Checkbox checked={!!data.deleteMessage} onChange={(v) => set({ deleteMessage: v })}>
          Удалить это сообщение
        </Checkbox>
      )}

      <Checkbox checked={data.requireAdmin !== false} onChange={(v) => set({ requireAdmin: v })}>
        Только по команде администратора
      </Checkbox>
      <p style={hint}>
        Наказание самого отправителя (например, за мат) прав не требует. Не отключайте эту галочку для команд:
        иначе любой участник сможет банить других.
      </p>
    </>
  );
}
