import { useState } from 'react';
import Icon from './Icon.jsx';

// Название строки реестра (переменная/тег) с inline-редактированием: карандаш → поле → Enter/галочка.
export default function RegistryName({ name, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = () => {
    setDraft(name);
    setError('');
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError('');
  };
  const save = async () => {
    if (busy) return;
    if (draft.trim() === name) return cancel();
    setBusy(true);
    const res = await onRename(draft);
    setBusy(false);
    if (res?.ok) cancel();
    else setError(res?.error ?? 'Не удалось переименовать.');
  };

  if (!editing) {
    return (
      <>
        <span className="registry-row__name">{name}</span>
        <button className="registry-row__edit" onClick={start} title="Переименовать" aria-label={`Переименовать ${name}`}>
          <Icon name="pen" />
        </button>
      </>
    );
  }

  return (
    <span className="registry-edit">
      <span className="registry-edit__line">
        <input
          className="input registry-edit__input"
          value={draft}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
          disabled={busy}
        />
        <button className="btn btn--sm btn--primary" onClick={save} disabled={busy} aria-label="Сохранить">
          <Icon name="check" />
        </button>
        <button className="btn btn--sm" onClick={cancel} disabled={busy} aria-label="Отмена">
          <Icon name="xmark" />
        </button>
      </span>
      {error && <span className="registry-edit__error">{error}</span>}
    </span>
  );
}
