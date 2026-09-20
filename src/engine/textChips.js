// Splits text on {{variable}} tokens so the UI can render them as chips
// instead of raw braces — e.g. "Hi {{Name}}" → [text "Hi ", var "Name"].
// Pure logic, no React — reused by the canvas node body and by the live
// preview under text fields in the properties panel.

export function splitIntoChipSegments(text) {
  const segments = [];
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text ?? ''))) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'variable', name: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < (text ?? '').length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}
