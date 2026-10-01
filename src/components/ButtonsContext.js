import { createContext } from 'react';

// Мост между холстом (FlowCanvas) и карточками блоков (BlockNode/NodeButtons):
// React Flow рендерит блоки сам, поэтому обработчики передаём через контекст.
// { editing: {nodeId, buttonId} | null, openButton, addButton, changeButtons }
export const ButtonsContext = createContext(null);
