// A small "insert variable" affordance for any text field whose value goes
// through interpolate() at runtime (message text, AI prompts, action
// url/body, setVariable value...). Inserts {{name}} at the cursor position
// — interpolate() already resolves personal vs. global automatically, so
// this doesn't need to care about scope, just list the names.

export default function VariableInserter({ variableDefs, targetRef, value, onChange }) {
  if (!variableDefs?.length) return null;

  const insert = (name) => {
    const el = targetRef?.current;
    const text = `{{${name}}}`;
    const start = el?.selectionStart ?? (value ?? '').length;
    const end = el?.selectionEnd ?? (value ?? '').length;
    const next = (value ?? '').slice(0, start) + text + (value ?? '').slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <select
      className="select"
      style={{ marginTop: -8, marginBottom: 12, fontSize: 11, padding: '4px 8px' }}
      value=""
      onChange={(e) => e.target.value && insert(e.target.value)}
    >
      <option value="">{'{{ }} Вставить переменную…'}</option>
      {variableDefs.map((v) => (
        <option key={v.id} value={v.name}>
          {v.name} ({v.scope === 'global' ? 'общая' : 'личная'})
        </option>
      ))}
    </select>
  );
}
