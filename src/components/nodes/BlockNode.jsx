import { Handle, Position } from 'reactflow';
import { BLOCK_DEFS } from '../../engine/blockDefs.js';
import { getButtonId } from '../../engine/buttonId.js';
import { groupButtonsIntoRows } from '../../engine/buttonLayout.js';
import { BUTTON_STYLES } from '../../engine/buttonStyles.js';
import ChipText from '../ChipText.jsx';

function summarize(type, data) {
  switch (type) {
    case 'note':
      return data.text || '';
    case 'event':
      return `${labelForTrigger(data.triggerType)}: ${data.value || '—'}`;
    case 'message':
      return data.text || '';
    case 'sendToChat': {
      const dest =
        data.targetType === 'variable'
          ? `по переменной: ${data.targetVariableName || '—'}`
          : data.targetType === 'manual'
            ? `вручную: ${data.targetManual || '—'}`
            : data.targetLabel || '— получатель не выбран —';
      return `→ ${dest}\n${data.text || ''}`;
    }
    case 'aiMessage':
      return `${data.model}\n↳ ${data.userPrompt || ''}`;
    case 'action':
      if (data.actionType === 'http') return `${data.method} ${data.url || '…'}`;
      if (data.actionType === 'deleteMessage') return data.targetNodeId ? 'удалить сообщение блока…' : 'блок не выбран';
      return data.actionType;
    case 'condition':
      if (data.operator === 'hasTag' || data.operator === 'notHasTag') {
        return `${symbolForOperator(data.operator)}: ${data.tagName || '—'}`;
      }
      if (data.operator === 'chatType') {
        return `источник: ${data.value === 'group' ? 'группа' : 'личка'}`;
      }
      return `${data.variableName || '—'} ${symbolForOperator(data.operator)} ${data.value || '—'}`;
    case 'chain':
      return data.flowName || 'не выбрана';
    case 'setVariable':
      return `${data.variableName || '—'} (${data.scope === 'global' ? 'общая' : 'личная'}) ${data.op} ${
        data.op === 'clear' ? '' : data.value ?? ''
      }`;
    case 'setTag':
      return `${data.op === 'add' ? '+ ' : '− '}${data.tagName || '—'} (${data.scope === 'global' ? 'общий' : 'личный'})`;
    default:
      return '';
  }
}

function labelForTrigger(t) {
  return { command: 'команда', text: 'текст', callback: 'кнопка', schedule: 'по расписанию' }[t] ?? t;
}

function symbolForOperator(op) {
  return (
    {
      equals: '=',
      notEquals: '≠',
      contains: '⊃',
      greaterThan: '>',
      lessThan: '<',
      hasTag: 'есть тег',
      notHasTag: 'нет тега'
    }[op] ?? op
  );
}

export default function BlockNode({ id, type, data, selected }) {
  const def = BLOCK_DEFS[type];
  if (!def) return null;
  const body = summarize(type, data);
  const supportsButtons = type === 'message' || type === 'sendToChat';
  const buttons = supportsButtons ? data.buttons ?? [] : [];
  const layout = data.buttonsLayout || 'inline';
  // keyboard-layout buttons are always wireable (no such thing as a
  // "keyboard URL button" in Telegram); inline url buttons never are
  const wireableButtons = layout === 'keyboard' ? buttons : buttons.filter((b) => b.kind !== 'url');

  return (
    <div className={`node${selected ? ' is-selected' : ''}`} style={{ '--node-color': def.color }}>
      {def.ports.in && <Handle type="target" position={Position.Left} />}

      <div className="node__header">
        <span className="node__dot" style={type === 'setTag' && data.color ? { background: data.color } : undefined} />
        <span className="node__title">{def.label}</span>
      </div>

      <div className={`node__body${body ? '' : ' node__body--empty'}`}>
        {body ? <ChipText text={body} /> : 'Не настроено'}
      </div>

      {supportsButtons && buttons.length > 0 && (
        <div className="node__buttons">
          {groupButtonsIntoRows(buttons).map((row, ri) => (
            <div className="node__button-grid-row" key={ri}>
              {row.map((b) => {
                const i = buttons.indexOf(b);
                const wireable = layout === 'keyboard' || b.kind !== 'url';
                const styleColor = BUTTON_STYLES.find((s) => s.value === (b.style || ''))?.color;
                return (
                  <div className="node__button-cell" key={getButtonId(b, i)}>
                    <span
                      className="node__button-chip"
                      style={styleColor ? { background: styleColor, color: '#fff', borderColor: styleColor } : undefined}
                    >
                      {layout === 'keyboard' ? '⌨️ ' : b.kind === 'url' ? '🔗 ' : ''}
                      {b.text || 'Кнопка'}
                    </span>
                    {wireable && (
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`btn-${getButtonId(b, i)}`}
                        className="node__button-handle"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {type === 'message' && buttons.length > 0 && wireableButtons.length === 0 && (
        // every button is a plain URL button — nothing to branch on, so the
        // node still needs a way to continue to whatever comes next
        <Handle type="source" position={Position.Right} />
      )}

      {type === 'message' && buttons.length === 0 && <Handle type="source" position={Position.Right} />}

      {/* sendToChat always continues its own flow right away — its
          buttons are for whoever it messaged, not for pausing this run */}
      {type === 'sendToChat' && <Handle type="source" position={Position.Right} />}

      {type !== 'message' &&
        type !== 'sendToChat' &&
        (def.ports.branches ? (
          <>
            <div className="node__branch-labels">
              <span>да ↓</span>
              <span>нет ↓</span>
            </div>
            <Handle type="source" position={Position.Right} id="true" style={{ top: '38%' }} />
            <Handle type="source" position={Position.Right} id="false" style={{ top: '68%' }} />
          </>
        ) : (
          def.ports.out && <Handle type="source" position={Position.Right} />
        ))}
    </div>
  );
}
