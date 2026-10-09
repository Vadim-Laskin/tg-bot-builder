import { useState } from 'react';
import ReactFlow, { Background, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { BLOCK_DEFS } from '../engine/blockDefs.js';
import { useBotStore } from '../store/useBotStore.js';
import { platformLabel } from '../lib/platform.js';
import BlockNode from './nodes/BlockNode.jsx';
import Modal from './Modal.jsx';

const nodeTypes = Object.fromEntries(Object.keys(BLOCK_DEFS).map((t) => [t, BlockNode]));

// Предпросмотр шаблона: сценарий целиком, только для просмотра (двигать и
// править нельзя). Внизу — как им воспользоваться: новый бот или добавить в имеющегося.
export default function TemplatePreview({ tpl, onClose, onCreateNew, onAdded }) {
  const bots = useBotStore((s) => s.bots).filter((b) => b.status !== 'disabled');
  const addTemplateToBot = useBotStore((s) => s.addTemplateToBot);

  const [adding, setAdding] = useState(false);
  const [botId, setBotId] = useState(bots[0]?.id ?? '');
  const [mode, setMode] = useState('main');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const ok = await addTemplateToBot(botId, tpl, mode);
    setBusy(false);
    if (ok) onAdded(botId);
  };

  return (
    <Modal title={tpl.name} onClose={onClose} wide>
      {tpl.description && <p className="tplp__desc">{tpl.description}</p>}

      <div className="tplp__canvas">
        <ReactFlowProvider>
          <ReactFlow
            nodes={tpl.nodes}
            edges={tpl.edges.map((e) => ({ ...e, animated: false }))}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      <p className="admin-hint">
        {tpl.nodes.length} блоков · колесо мыши или щипок — масштаб, перетаскивание — сдвиг. Это только просмотр.
      </p>

      {!adding ? (
        <div className="modal__actions">
          <button className="btn btn--sm" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn btn--sm" onClick={() => setAdding(true)} disabled={bots.length === 0} title={bots.length === 0 ? 'У вас ещё нет ботов' : ''}>
            Добавить в моего бота
          </button>
          <button className="btn btn--primary btn--sm" onClick={onCreateNew}>
            Создать нового бота
          </button>
        </div>
      ) : (
        <div className="tplp__add">
          <div className="field">
            <span className="field__label">В какого бота</span>
            <select className="select" value={botId} onChange={(e) => setBotId(e.target.value)}>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {platformLabel(b)}
                </option>
              ))}
            </select>
          </div>
          <label className="tplp__radio">
            <input type="radio" checked={mode === 'main'} onChange={() => setMode('main')} />
            <span>
              <b>В основной сценарий</b>
              <small>Блоки появятся ниже уже имеющихся, ничего не удаляется. Событие /start из шаблона добавится рядом с вашим.</small>
            </span>
          </label>
          <label className="tplp__radio">
            <input type="radio" checked={mode === 'chain'} onChange={() => setMode('chain')} />
            <span>
              <b>Отдельной цепочкой</b>
              <small>Новый сценарий в боте; запускать его нужно блоком «Цепочка».</small>
            </span>
          </label>
          <div className="modal__actions">
            <button className="btn btn--sm" onClick={() => setAdding(false)} disabled={busy}>
              Назад
            </button>
            <button className="btn btn--primary btn--sm" onClick={add} disabled={busy || !botId}>
              {busy ? 'Добавляю…' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
