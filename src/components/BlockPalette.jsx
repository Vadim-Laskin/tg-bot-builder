import { BLOCK_CATEGORIES, blocksByCategory } from '../engine/blockDefs.js';

export default function BlockPalette() {
  const grouped = blocksByCategory();

  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/flowbase-block', blockType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      {Object.entries(BLOCK_CATEGORIES).map(([catKey, catLabel]) => (
        <div key={catKey}>
          <div className="palette__category-title">{catLabel}</div>
          {grouped[catKey].map((block) => (
            <div
              key={block.type}
              className="palette__block"
              draggable
              onDragStart={(e) => onDragStart(e, block.type)}
              title="Перетащите на холст"
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
