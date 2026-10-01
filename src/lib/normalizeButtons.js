import { nanoid } from 'nanoid';

// Кнопки, сохранённые давно, могут не иметь `id` — тогда их точка на блоке
// называлась `btn-i<номер>`, а номер ломается при перестановке. Один раз при
// открытии флоу раздаём им настоящие id и переписываем привязанные стрелки.
export function normalizeButtonIds(nodes, edges) {
  let nextEdges = edges;
  let changed = false;

  const nextNodes = nodes.map((n) => {
    if (!Array.isArray(n.data?.buttons) || n.data.buttons.every((b) => b.id)) return n;
    changed = true;
    const renames = {};
    const buttons = n.data.buttons.map((b, i) => {
      if (b.id) return b;
      const id = nanoid(6);
      renames[`btn-i${i}`] = `btn-${id}`;
      return { ...b, id };
    });
    nextEdges = nextEdges.map((e) =>
      e.source === n.id && renames[e.sourceHandle] ? { ...e, sourceHandle: renames[e.sourceHandle] } : e
    );
    return { ...n, data: { ...n.data, buttons } };
  });

  return changed ? { nodes: nextNodes, edges: nextEdges } : { nodes, edges };
}
