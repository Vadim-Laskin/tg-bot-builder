import { splitIntoChipSegments } from '../engine/textChips.js';

// Renders text with {{variable}} tokens shown as small turquoise chips
// (same color as the variable registry) instead of raw braces — "Hi
// {{Name}}" reads as "Hi [Name]". Purely visual; the underlying value in
// storage is still the plain {{Name}} text, editable as such in the
// textarea this sits next to.
export default function ChipText({ text, empty }) {
  if (!text) return <span className="node__body--empty">{empty ?? 'Не настроено'}</span>;

  const segments = splitIntoChipSegments(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'variable' ? (
          <span className="var-chip" key={i}>
            {seg.name}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}
