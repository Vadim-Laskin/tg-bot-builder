import { useState } from 'react';
import { useTemplateStore } from '../store/useTemplateStore.js';
import { useBotStore } from '../store/useBotStore.js';
import Modal from './Modal.jsx';

export default function TemplatesGallery({ onOpenBot }) {
  const templates = useTemplateStore((s) => s.templates);
  const isAdmin = useTemplateStore((s) => s.isAdmin);
  const removeTemplate = useTemplateStore((s) => s.removeTemplate);
  const addTemplate = useTemplateStore((s) => s.addTemplate);

  const bots = useBotStore((s) => s.bots);
  const createBot = useBotStore((s) => s.createBot);
  const updateFlowGraph = useBotStore((s) => s.updateFlowGraph);
  const setActiveBot = useBotStore((s) => s.setActiveBot);

  const [addOpen, setAddOpen] = useState(false);

  const useTemplate = (tpl) => {
    const botId = createBot(`${tpl.name} (из шаблона)`);
    const bot = useBotStore.getState().bots.find((b) => b.id === botId);
    const mainFlow = bot.flows[0];
    updateFlowGraph(botId, mainFlow.id, {
      nodes: structuredClone(tpl.nodes),
      edges: structuredClone(tpl.edges)
    });
    setActiveBot(botId);
    onOpenBot();
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Шаблоны</h1>
          <p className="page__subtitle">Готовые сценарии — используйте как основу для нового бота.</p>
        </div>
        {isAdmin && (
          <button className="btn btn--primary" onClick={() => setAddOpen(true)}>
            + Добавить шаблон
          </button>
        )}
      </div>

      <div className="templates-grid">
        {templates.map((tpl) => (
          <div className="template-card" key={tpl.id}>
            <div className="template-card__name">{tpl.name}</div>
            <div className="template-card__desc">{tpl.description}</div>
            <div className="template-card__meta">{tpl.nodes.length} блоков</div>
            <div className="template-card__actions">
              <button className="btn btn--primary btn--sm" onClick={() => useTemplate(tpl)}>
                Использовать
              </button>
              {isAdmin && (
                <button className="btn btn--sm btn--danger" onClick={() => removeTemplate(tpl.id)}>
                  Удалить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {addOpen && (
        <Modal title="Добавить шаблон из бота" onClose={() => setAddOpen(false)}>
          <AddTemplateForm bots={bots} onAdd={addTemplate} onClose={() => setAddOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function AddTemplateForm({ bots, onAdd, onClose }) {
  const allFlows = bots.flatMap((b) => b.flows.map((f) => ({ ...f, botName: b.name })));
  const [flowId, setFlowId] = useState(allFlows[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    const flow = allFlows.find((f) => f.id === flowId);
    if (!flow || !name.trim()) return;
    onAdd({ name, description, nodes: structuredClone(flow.nodes), edges: structuredClone(flow.edges) });
    onClose();
  };

  if (allFlows.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Сначала создайте хотя бы одного бота с флоу.</p>;
  }

  return (
    <div>
      <div className="field">
        <span className="field__label">Флоу-источник</span>
        <select className="select" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
          {allFlows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.botName} → {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="field__label">Название шаблона</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="field__label">Описание</span>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn--primary btn--sm" onClick={submit}>
          Опубликовать
        </button>
      </div>
    </div>
  );
}
