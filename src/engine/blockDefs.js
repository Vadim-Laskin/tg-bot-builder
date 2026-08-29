// Every block type is defined once, here. The palette, the canvas nodes,
// the properties panel and the execution engine all read from this file —
// add a new block by adding one entry, no need to touch five files.

export const BLOCK_CATEGORIES = {
  content: 'Контент',
  logic: 'Логика',
  data: 'Данные',
  structure: 'Структура'
};

export const BLOCK_DEFS = {
  note: {
    type: 'note',
    label: 'Заметка',
    description: 'Комментарий на холсте. Не влияет на выполнение бота.',
    category: 'content',
    color: 'var(--wire-note)',
    ports: { in: true, out: false },
    defaultData: { text: 'Заметка…' }
  },

  event: {
    type: 'event',
    label: 'Событие',
    description: 'Точка входа: команда, текст, нажатие кнопки или расписание.',
    category: 'logic',
    color: 'var(--wire-event)',
    ports: { in: false, out: true },
    defaultData: {
      triggerType: 'command', // command | text | callback | schedule
      value: '/start'
    }
  },

  message: {
    type: 'message',
    label: 'Сообщение',
    description: 'Отправляет текст, медиа и кнопки пользователю.',
    category: 'content',
    color: 'var(--wire-message)',
    ports: { in: true, out: true },
    defaultData: {
      text: 'Привет! 👋',
      buttons: [] // [{ text, action: 'next' | 'url', value }]
    }
  },

  aiMessage: {
    type: 'aiMessage',
    label: 'Сообщение с ИИ',
    description: 'Генерирует ответ через Groq по промпту и контексту диалога.',
    category: 'content',
    color: 'var(--wire-ai)',
    ports: { in: true, out: true },
    defaultData: {
      model: 'llama-3.3-70b-versatile',
      systemPrompt: 'Ты — дружелюбный ассистент бренда.',
      userPrompt: '{{last_message}}',
      saveTo: '' // optional variable name to store the AI reply
    }
  },

  action: {
    type: 'action',
    label: 'Действие',
    description: 'HTTP-запрос, вебхук или встроенное действие (например, typing).',
    category: 'logic',
    color: 'var(--wire-action)',
    ports: { in: true, out: true },
    defaultData: {
      actionType: 'http', // http | typing | delay
      method: 'POST',
      url: '',
      body: ''
    }
  },

  condition: {
    type: 'condition',
    label: 'По условию',
    description: 'Ветвление по переменной/тегу: «да» или «нет».',
    category: 'logic',
    color: 'var(--wire-condition)',
    ports: { in: true, out: true, branches: ['true', 'false'] },
    defaultData: {
      variable: '',
      operator: 'equals', // equals | notEquals | contains | greaterThan | lessThan | hasTag | notHasTag
      value: ''
    }
  },

  chain: {
    type: 'chain',
    label: 'Цепочка',
    description: 'Переиспользуемый под-сценарий из другого флоу.',
    category: 'structure',
    color: 'var(--wire-chain)',
    ports: { in: true, out: true },
    defaultData: { flowId: '', flowName: '' }
  },

  setVariable: {
    type: 'setVariable',
    label: 'Изменение переменной',
    description: 'Устанавливает, увеличивает или очищает переменную.',
    category: 'data',
    color: 'var(--wire-variable)',
    ports: { in: true, out: true },
    defaultData: { name: '', op: 'set', value: '' } // set | increment | clear
  },

  setTag: {
    type: 'setTag',
    label: 'Изменение тегов',
    description: 'Добавляет или убирает тег у пользователя.',
    category: 'data',
    color: 'var(--wire-tag)',
    ports: { in: true, out: true },
    defaultData: { tag: '', op: 'add' } // add | remove
  }
};

export const BLOCK_LIST = Object.values(BLOCK_DEFS);

export function blocksByCategory() {
  const map = {};
  for (const key of Object.keys(BLOCK_CATEGORIES)) map[key] = [];
  for (const block of BLOCK_LIST) map[block.category].push(block);
  return map;
}
