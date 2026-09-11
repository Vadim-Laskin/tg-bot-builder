import FlowCanvas from './FlowCanvas.jsx';
import { useBotStore } from '../store/useBotStore.js';

export default function BotEditorView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const flow = useBotStore((s) => s.getActiveFlow());
  const renameFlow = useBotStore((s) => s.renameFlow);

  if (!bot || !flow) {
    return (
      <div className="page">
        <p>Сценарий не найден.</p>
        <button className="btn" onClick={onBack}>
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="editor-topbar">
        <button className="btn btn--sm" onClick={onBack}>
          ←
        </button>
        <span className="editor-topbar__crumb">{bot.name} /</span>
        <span
          className="editor-topbar__name"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => renameFlow(bot.id, flow.id, e.currentTarget.textContent)}
        >
          {flow.name}
        </span>
      </div>

      <FlowCanvas bot={bot} flow={flow} />
    </div>
  );
}
