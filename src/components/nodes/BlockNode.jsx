import { Handle, Position } from 'reactflow';
import { BLOCK_DEFS } from '../../engine/blockDefs.js';
import { getButtonId } from '../../engine/buttonId.js';

function summarize(type, data) {
  switch (type) {
    case 'note':
      return data.text || '';
    case 'event':
      return `${labelForTrigger(data.triggerType)}: ${data.value || '—'}`;
    case 'message':
      return data.text || '';
    case 'aiMessage':
      return `${data.model}\n↳ ${data.userPrompt || ''}`;
    case 'action':
      return data.actionType === 'http' ? `${data.method} ${data.url || '…'}` : data.actionType;
    case 'condition':
      return `${data.variable || '—'} ${symbolForOperator(data.operator)} ${data.value || '—'}`;
    case 'chain':
      return data.flowName || 'не выбрана';
    case 'setVariable':
      return `${data.name || '—'} ${data.op} ${data.op === 'clear' ? '' : data.value ?? ''}`;
    case 'setTag':
      return `${data.op === 'add' ? '+ ' : '− '}${data.tag || '—'}`;
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
  const buttons = type === 'message' ? data.buttons ?? [] : [];
  const callbackButtons = buttons.filter((b) => b.kind !== 'url');

  return (
    <div className={`node${selected ? ' is-selected' : ''}`} style={{ '--node-color': def.color }}>
      {def.ports.in && <Handle type="target" position={Position.Left} />}

      <div className="node__header">
        <span className="node__dot" />
        <span className="node__title">{def.label}</span>
      </div>

      <div className={`node__body${body ? '' : ' node__body--empty'}`}>{body || 'Не настроено'}</div>

      {type === 'message' && buttons.length > 0 && (
        <div className="node__buttons">
          {buttons.map((b, i) => (
            <div className="node__button-row" key={getButtonId(b, i)}>
              <span className="node__button-chip">
                {b.kind === 'url' ? '🔗 ' : ''}
                {b.text || 'Кнопка'}
              </span>
              {b.kind !== 'url' && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${getButtonId(b, i)}`}
                  className="node__button-handle"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {type === 'message' && buttons.length > 0 && callbackButtons.length === 0 && (
        // every button is a plain URL button — nothing to branch on, so the
        // node still needs a way to continue to whatever comes next
        <Handle type="source" position={Position.Right} />
      )}

      {type !== 'message' &&
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

      {type === 'message' && buttons.length === 0 && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
