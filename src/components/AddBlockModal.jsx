import Modal from './Modal.jsx';
import { BLOCK_CATEGORIES, blocksByCategory } from '../engine/blockDefs.js';

export default function AddBlockModal({ onAdd, onClose }) {
  const grouped = blocksByCategory();

  return (
    <Modal title="Добавить блок" onClose={onClose} wide>
      <div className="block-picker">
        {Object.entries(BLOCK_CATEGORIES).map(([catKey, catLabel]) => (
          <div key={catKey}>
            <div className="palette__category-title">{catLabel}</div>
            {grouped[catKey].map((block) => (
              <div key={block.type} className="palette__block" onClick={() => onAdd(block.type)}>
                <span className="palette__block-dot" style={{ background: block.color }} />
                <span className="palette__block-text">
                  <span className="palette__block-label">{block.label}</span>
                  <span className="palette__block-desc">{block.description}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
