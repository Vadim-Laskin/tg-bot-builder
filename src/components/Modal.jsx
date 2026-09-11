export default function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal__backdrop" onMouseDown={onClose}>
      <div className={`modal__box${wide ? ' modal__box--wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
