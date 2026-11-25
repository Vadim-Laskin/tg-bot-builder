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
    description: 'Точка входа: команда, текст, проверка сообщений на нарушения или расписание.',
    category: 'logic',
    color: 'var(--wire-event)',
    ports: { in: false, out: true },
    defaultData: {
      triggerType: 'command', // command | text | violation | schedule
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
      buttonsLayout: 'inline', // inline (под сообщением) | keyboard (под полем ввода) — групп/каналы всегда получают inline, решается автоматически
      buttons: [], // [{ id, text, kind: 'callback' | 'url', url?, style? }] — style: '' | 'primary' | 'success' | 'danger' (real Telegram button colors, Bot API 9.4+)
      editPrevious: false, // edit the message that had the pressed button, instead of sending a new one
      waitForReply: false, // pause and capture the user's next free-text message
      captureVariableId: '',
      captureVariableName: '',
      captureScope: 'personal'
    }
  },

  sendToChat: {
    type: 'sendToChat',
    label: 'Отправить в чат',
    description: 'Отправляет сообщение в другой чат — группу, канал или конкретному пользователю.',
    category: 'content',
    color: 'var(--wire-broadcast)',
    ports: { in: true, out: true },
    defaultData: {
      targetType: 'group', // group | user | variable | manual
      targetChatId: '', // for group/user — picked from the bot's known chats
      targetLabel: '', // denormalized display name for the canvas summary
      targetVariableId: '',
      targetVariableName: '',
      scope: 'personal',
      targetManual: '', // for manual — a literal chat id, interpolatable
      text: 'Привет! 👋',
      buttonsLayout: 'inline', // forced to 'inline' in the UI when targetType is 'group'
      buttons: [] // same shape as "Сообщение" — kind: 'callback' buttons work normally when pressed in the target chat
    }
  },

  moderation: {
    type: 'moderation',
    label: 'Модерация',
    description: 'Предупреждение, мут, бан, удаление из группы или канала, снятие наказаний (только Telegram).',
    category: 'logic',
    color: 'var(--wire-moderation)',
    ports: { in: true, out: true, branches: ['true', 'false'] },
    branchLabels: ['готово', 'ошибка'],
    defaultData: {
      action: 'mute', // warn | resetWarns | mute | unmute | kick | ban | unban | delete
      target: 'sender', // sender — автор сообщения | reply — тот, на чьё сообщение ответили | manual — ID
      targetManual: '',
      chatSource: 'current', // current | chosen
      targetChatId: '',
      targetLabel: '',
      duration: '60', // срок мута/бана: «30», «2ч», «1д»; пусто — навсегда
      durationFromCommand: true, // «/mute 2ч» важнее поля duration
      deleteMessage: false,
      warnLimit: 3,
      limitAction: 'mute', // mute | kick | ban
      requireAdmin: true
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
      model: 'openai/gpt-oss-120b',
      systemPrompt: 'Ты — дружелюбный ассистент бренда.',
      userPrompt: '{{last_message}}',
      saveTo: '', // optional variable name to store the AI reply
      editPrevious: false,
      allowButtons: false // let the AI attach its own quick-reply buttons when it decides they help
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
      actionType: 'http', // http | typing | delay | deleteMessage | deleteUserMessage
      method: 'POST',
      url: '',
      body: '',
      targetNodeId: '' // used by deleteMessage — id of the "Сообщение"/"Сообщение с ИИ" block to delete
    }
  },

  condition: {
    type: 'condition',
    label: 'По условию',
    description: 'Ветвление по переменной, тегу или источнику сообщения (личка/группа): «да» или «нет».',
    category: 'logic',
    color: 'var(--wire-condition)',
    ports: { in: true, out: true, branches: ['true', 'false'] },
    defaultData: {
      // variable*/tag* come from the registry ("🔢 Переменные" / "🏷 Теги")
      // — which pair is used depends on the operator below
      variableId: '',
      variableName: '',
      tagId: '',
      tagName: '',
      scope: 'personal',
      operator: 'equals', // equals | notEquals | contains | greaterThan | lessThan | hasTag | notHasTag | chatType | senderIsAdmin
      value: '' // comparison target — also holds 'private' | 'group' when operator is chatType
    }
  },

  chain: {
    type: 'chain',
    label: 'Цепочка',
    description: 'Связывает сценарии: «Новая» — начало цепочки с названием, «Переход к …» — продолжение в другом сценарии.',
    category: 'structure',
    color: 'var(--wire-chain)',
    // входной порт скрыт у «Новой» (это начало), выходной — у «Перехода» (после него сценарий не продолжается);
    // см. BlockNode.jsx
    ports: { in: true, out: true },
    defaultData: {
      mode: 'new', // new — начало цепочки | goto — переход к цепочке
      chainId: '', // new: свой id (создаётся автоматически) | goto: id выбранной цепочки
      chainName: '' // new: название, которое вы придумали | goto: копия названия для подписи на блоке
    }
  },

  setVariable: {
    type: 'setVariable',
    label: 'Изменение переменной',
    description: 'Устанавливает, увеличивает или очищает переменную.',
    category: 'data',
    color: 'var(--wire-variable)',
    ports: { in: true, out: true },
    // variableId/variableName/scope are set by picking from the registry
    // (see "🔢 Переменные" in the editor topbar) — not typed free-hand
    defaultData: { variableId: '', variableName: '', scope: 'personal', op: 'set', value: '' } // set | increment | clear
  },

  setTag: {
    type: 'setTag',
    label: 'Изменение тегов',
    description: 'Добавляет или убирает тег у пользователя.',
    category: 'data',
    color: 'var(--wire-tag)',
    ports: { in: true, out: true },
    // tagId/tagName/scope/color come from the registry ("🏷 Теги")
    defaultData: { tagId: '', tagName: '', color: '', scope: 'personal', op: 'add' } // add | remove
  }
};

export const BLOCK_LIST = Object.values(BLOCK_DEFS);

export function blocksByCategory() {
  const map = {};
  for (const key of Object.keys(BLOCK_CATEGORIES)) map[key] = [];
  for (const block of BLOCK_LIST) map[block.category].push(block);
  return map;
}
