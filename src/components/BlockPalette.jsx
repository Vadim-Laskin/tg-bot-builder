import { BLOCK_CATEGORIES, blocksByCategory } from '../engine/blockDefs.js';

export default function BlockPalette({ open, onClose, onAddBlock }) {
  const grouped = blocksByCategory();

  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/flowbase-block', blockType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className={`palette${open ? ' is-open' : ''}`}>
      <div className="palette__mobile-header">
        <span>Блоки</span>
        <button className="btn btn--sm" onClick={onClose}>
          Готово
        </button>
      </div>
      {Object.entries(BLOCK_CATEGORIES).map(([catKey, catLabel]) => (
        <div key={catKey}>
          <div className="palette__category-title">{catLabel}</div>
          {grouped[catKey].map((block) => (
            <div
              key={block.type}
              className="palette__block"
              draggable
              onDragStart={(e) => onDragStart(e, block.type)}
              onClick={() => onAddBlock?.(block.type)}
              title="Перетащите на холст или нажмите, чтобы добавить"
            >
              <span className="palette__block-dot" style={{ background: block.color }} />
              <span className="palette__block-text">
                <span className="palette__block-label">{block.label}</span>
                <span className="palette__block-desc">{block.description}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
