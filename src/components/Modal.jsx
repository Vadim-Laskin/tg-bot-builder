export default function Modal({ title, children, onClose }) {
  return (
    <div className="modal__backdrop" onMouseDown={onClose}>
      <div className="modal__box" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
