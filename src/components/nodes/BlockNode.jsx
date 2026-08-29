import { Handle, Position } from 'reactflow';
import { BLOCK_DEFS } from '../../engine/blockDefs.js';

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

  return (
    <div className={`node${selected ? ' is-selected' : ''}`} style={{ '--node-color': def.color }}>
      {def.ports.in && <Handle type="target" position={Position.Left} />}

      <div className="node__header">
        <span className="node__dot" />
        <span className="node__title">{def.label}</span>
      </div>

      <div className={`node__body${body ? '' : ' node__body--empty'}`}>{body || 'Не настроено'}</div>

      {def.ports.branches ? (
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
      )}
    </div>
  );
}
