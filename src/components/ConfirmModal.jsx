import { useEffect } from 'react';
import Icon from './Icon.jsx';

// Красивое подтверждение вместо системного confirm().
// danger — красная кнопка и иконка предупреждения.
export default function ConfirmModal({
  title,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  busy = false,
  onConfirm,
  onClose
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal__backdrop" onMouseDown={onClose}>
      <div
        className="modal__box confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={`confirm__icon${danger ? ' confirm__icon--danger' : ''}`}>
          <Icon name={danger ? 'trash' : 'circle-question'} />
        </span>
        <h3 className="confirm__title" id="confirm-title">
          {title}
        </h3>
        <div className="confirm__body">{children}</div>
        <div className="confirm__actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`btn ${danger ? 'btn--danger-solid' : 'btn--primary'}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
