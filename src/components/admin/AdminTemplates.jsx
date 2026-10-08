import { useState } from 'react';
import { useTemplateStore } from '../../store/useTemplateStore.js';
import { useBotStore } from '../../store/useBotStore.js';
import Modal from '../Modal.jsx';

// Готовые шаблоны создают только админы (политики базы это и так гарантируют);
// пользователи шаблоны лишь используют на вкладке «Шаблоны».
export default function AdminTemplates() {
  const templates = useTemplateStore((s) => s.templates);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const removeTemplate = useTemplateStore((s) => s.removeTemplate);
  const bots = useBotStore((s) => s.bots);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <div>
      <div className="admin-toolbar">
        <button className="btn btn--primary btn--sm" onClick={() => setCreateOpen(true)}>
          + Создать шаблон
        </button>
        <span className="admin-hint">Шаблон собирается из сценария одного из ваших ботов — сначала соберите и проверьте его там.</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--static">
          <thead>
            <tr>
              <th>Шаблон</th>
              <th>Блоков</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="admin-cell-title">{t.name}</div>
                  <div className="admin-cell-sub">{t.description || 'без описания'}</div>
                </td>
                <td>{t.nodes.length}</td>
                <td>
                  <div className="admin-actions">
                    <button className="btn btn--sm" onClick={() => setEditing(t)}>
                      Изменить
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => confirm(`Удалить шаблон «${t.name}»? Боты, созданные из него, останутся.`) && removeTemplate(t.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={3} className="admin-empty">
                  Шаблонов пока нет — создайте первый
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <Modal title="Новый шаблон" onClose={() => setCreateOpen(false)}>
          <CreateForm bots={bots} onAdd={addTemplate} onClose={() => setCreateOpen(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Изменить шаблон" onClose={() => setEditing(null)}>
          <EditForm tpl={editing} onSave={updateTemplate} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function CreateForm({ bots, onAdd, onClose }) {
  const flows = bots.flatMap((b) => b.flows.map((f) => ({ ...f, bot: b })));
  const [flowId, setFlowId] = useState(flows[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  if (flows.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Сначала создайте бота со сценарием — шаблон собирается из него.</p>;
  }

  const submit = async () => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow || !name.trim()) return;
    setBusy(true);
    await onAdd({
      name: name.trim(),
      description: description.trim(),
      nodes: structuredClone(flow.nodes),
      edges: structuredClone(flow.edges),
      variableDefs: structuredClone(flow.bot.variableDefs),
      tagDefs: structuredClone(flow.bot.tagDefs)
    });
    setBusy(false);
    onClose();
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">Сценарий-источник</span>
        <select className="select" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.bot.name} → {f.name} ({f.nodes.length} блоков)
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="field__label">Название</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="field__label">Описание</span>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <p className="admin-hint">Переменные и теги бота-источника войдут в шаблон. Проверьте, что в блоках нет личных данных (id чатов, ссылки).</p>
      <div className="modal__actions">
        <button className="btn btn--sm" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn--primary btn--sm" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Публикую…' : 'Опубликовать'}
        </button>
      </div>
    </div>
  );
}

function EditForm({ tpl, onSave, onClose }) {
  const [name, setName] = useState(tpl.name);
  const [description, setDescription] = useState(tpl.description);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onSave(tpl.id, { name: name.trim(), description: description.trim() });
    setBusy(false);
    onClose();
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">Название</span>
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
        <button className="btn btn--primary btn--sm" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
