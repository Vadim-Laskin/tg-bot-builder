// Стартовые шаблоны для мастера «Новый бот». Каждый — функция build(),
// которая возвращает готовый граф основного флоу + переменные и теги,
// нужные его блокам. Собрано только из существующих блоков (blockDefs.js).
//
// Имена переменных — латиницей: {{name}} в тексте подставляется по regex \w,
// который кириллицу не ловит.

import { BLOCK_DEFS } from './blockDefs.js';

const COL = 380;
const ROW = 300;

const node = (id, type, col, row, data = {}) => ({
  id,
  type,
  position: { x: col * COL, y: row * ROW },
  data: { ...structuredClone(BLOCK_DEFS[type].defaultData), ...data }
});

const edge = (source, target, handle) => ({
  id: `e-${source}-${handle ?? 'out'}-${target}`,
  source,
  target,
  ...(handle ? { sourceHandle: handle } : {}),
  animated: true
});

const btn = (id, text) => ({ id, text, kind: 'callback', newRow: true });
const note = (id, col, row, text) => node(id, 'note', col, row, { text });
const ev = (id, col, row) => node(id, 'event', col, row, { triggerType: 'command', value: '/start' });

const varDef = (name) => ({ id: `v_${name}`, name, scope: 'personal' });
const tagDef = (name, color) => ({ id: `t_${name}`, name, color, scope: 'personal' });

const setVar = (id, col, row, name, op, value) =>
  node(id, 'setVariable', col, row, { variableId: `v_${name}`, variableName: name, scope: 'personal', op, value });

const setTag = (id, col, row, name, color, op) =>
  node(id, 'setTag', col, row, { tagId: `t_${name}`, tagName: name, color, scope: 'personal', op });

const ask = (id, col, row, text, name) =>
  node(id, 'message', col, row, {
    text,
    waitForReply: true,
    captureVariableId: `v_${name}`,
    captureVariableName: name,
    captureScope: 'personal'
  });

// ---------- 1. Меню с кнопками ----------
function menu() {
  const back = [btn('back', '← Назад')];
  const page = (id, row, text) => node(id, 'message', 2, row, { text, editPrevious: true, buttons: back });
  return {
    nodes: [
      ev('start', 0, 1),
      node('home', 'message', 1, 1, {
        text: 'Привет! 👋\nВыберите раздел:',
        editPrevious: true,
        buttons: [btn('about', 'ℹ️ О нас'), btn('price', '💰 Цены'), btn('contacts', '📞 Контакты')]
      }),
      page('about', 0, 'ℹ️ О нас\n\nРасскажите здесь о себе или о своём деле.'),
      page('price', 1, '💰 Цены\n\nДобавьте сюда список услуг и стоимость.'),
      page('contacts', 2, '📞 Контакты\n\nТелефон, почта, адрес, ссылки.')
    ],
    edges: [
      edge('start', 'home'),
      edge('home', 'about', 'btn-about'),
      edge('home', 'price', 'btn-price'),
      edge('home', 'contacts', 'btn-contacts'),
      edge('about', 'home', 'btn-back'),
      edge('price', 'home', 'btn-back'),
      edge('contacts', 'home', 'btn-back')
    ],
    variableDefs: [],
    tagDefs: []
  };
}

// ---------- 2. Подписка на рассылки ----------
function subscribe() {
  const color = '#3e8ede';
  return {
    nodes: [
      ev('start', 0, 1),
      node('ask', 'message', 1, 1, {
        text: 'Привет! 👋 Хотите получать наши новости и подборки?',
        buttons: [btn('yes', '✅ Подписаться'), btn('no', '🚫 Отписаться')]
      }),
      setTag('tagOn', 2, 0, 'подписчик', color, 'add'),
      node('okOn', 'message', 3, 0, { text: 'Вы подписаны 🎉 Скоро пришлём что-нибудь интересное.' }),
      setTag('tagOff', 2, 2, 'подписчик', color, 'remove'),
      node('okOff', 'message', 3, 2, { text: 'Вы отписались. Если передумаете — напишите /start.' }),
      note('hint', 1, 2.4, 'Тег «подписчик» ставится пользователю — по нему можно ветвить сценарии блоком «По условию → Есть тег».')
    ],
    edges: [
      edge('start', 'ask'),
      edge('ask', 'tagOn', 'btn-yes'),
      edge('tagOn', 'okOn'),
      edge('ask', 'tagOff', 'btn-no'),
      edge('tagOff', 'okOff')
    ],
    variableDefs: [],
    tagDefs: [tagDef('подписчик', color)]
  };
}

// ---------- 3. Запись на мероприятие ----------
function event() {
  const color = '#8bc34a';
  return {
    nodes: [
      ev('start', 0, 1),
      node('intro', 'message', 1, 1, {
        text: '🎟 Мероприятие «Название»\n📅 Дата и время\n📍 Место\n\nХотите записаться?',
        buttons: [btn('go', '✍️ Записаться')]
      }),
      ask('askName', 2, 1, 'Как вас зовут?', 'name'),
      ask('askContact', 3, 1, 'Оставьте телефон или @username для связи:', 'contact'),
      setTag('tag', 4, 1, 'записан', color, 'add'),
      node('notify', 'sendToChat', 5, 1, {
        targetType: 'group',
        text: '🆕 Новая запись: {{name}}, контакты: {{contact}}'
      }),
      node('done', 'message', 6, 1, { text: 'Готово, {{name}}! Вы записаны ✅\nМы свяжемся с вами по {{contact}}.' }),
      note('hint', 5, 2.1, 'Выберите в блоке «Отправить в чат» группу или канал, куда присылать записи. Пока не выбрано — шаг пропускается.')
    ],
    edges: [
      edge('start', 'intro'),
      edge('intro', 'askName', 'btn-go'),
      edge('askName', 'askContact'),
      edge('askContact', 'tag'),
      edge('tag', 'notify'),
      edge('notify', 'done')
    ],
    variableDefs: [varDef('name'), varDef('contact')],
    tagDefs: [tagDef('записан', color)]
  };
}

// ---------- 4. Рассылка по расписанию ----------
function schedule() {
  return {
    nodes: [
      node('trigger', 'event', 0, 1, { triggerType: 'schedule', value: '' }),
      node('send', 'sendToChat', 1, 1, {
        targetType: 'group',
        text: '📢 Доброе утро! Вот что нового сегодня…'
      }),
      note(
        'hint',
        0,
        2.1,
        '⚠️ Автозапуск по времени пока не реализован: событие «По расписанию» само не срабатывает. Выберите чат в блоке «Отправить в чат» — сценарий готов к подключению планировщика.'
      )
    ],
    edges: [edge('trigger', 'send')],
    variableDefs: [],
    tagDefs: []
  };
}

// ---------- 5. Тест с баллами ----------
function quiz() {
  const questions = [
    { q: 'Сколько будет 2 + 2?', answers: ['3', '4', '5'], right: 1 },
    { q: 'Столица Франции?', answers: ['Лондон', 'Париж', 'Рим'], right: 1 },
    { q: 'Сколько дней в неделе?', answers: ['5', '6', '7'], right: 2 }
  ];

  const nodes = [
    ev('start', 0, 1),
    node('intro', 'message', 1, 1, {
      text: '🧠 Мини-тест из 3 вопросов. За каждый верный ответ — 1 балл.',
      buttons: [btn('go', '▶️ Начать')]
    }),
    setVar('reset', 2, 1, 'score', 'set', '0')
  ];
  const edges = [edge('start', 'intro'), edge('intro', 'reset', 'btn-go'), edge('reset', 'q0')];

  questions.forEach((item, i) => {
    const col = 3 + i * 2;
    const nextId = i + 1 < questions.length ? `q${i + 1}` : 'check';
    nodes.push(
      node(`q${i}`, 'message', col, 1, {
        text: `Вопрос ${i + 1} из ${questions.length}\n${item.q}`,
        buttons: item.answers.map((a, k) => btn(`a${k}`, a))
      }),
      setVar(`plus${i}`, col + 1, 0, 'score', 'increment', '1')
    );
    item.answers.forEach((_, k) => {
      edges.push(edge(`q${i}`, k === item.right ? `plus${i}` : nextId, `btn-a${k}`));
    });
    edges.push(edge(`plus${i}`, nextId));
  });

  const endCol = 3 + questions.length * 2;
  nodes.push(
    node('check', 'condition', endCol, 1, { variableId: 'v_score', variableName: 'score', scope: 'personal', operator: 'greaterThan', value: '1' }),
    node('win', 'message', endCol + 1, 0, { text: '🎉 Отлично! Ваш результат: {{score}} из 3.' }),
    node('lose', 'message', endCol + 1, 2, {
      text: 'Ваш результат: {{score}} из 3. Попробуйте ещё раз!',
      buttons: [btn('again', '🔄 Пройти заново')]
    }),
    note('hint', 3, 2.2, 'Замените вопросы на свои. Верный ответ — та кнопка, что ведёт в блок «+1 к score».')
  );
  edges.push(edge('check', 'win', 'true'), edge('check', 'lose', 'false'), edge('lose', 'reset', 'btn-again'));

  return { nodes, edges, variableDefs: [varDef('score')], tagDefs: [] };
}

// ---------- 6. Сбор заявок ----------
function leads() {
  const color = '#e8734d';
  return {
    nodes: [
      ev('start', 0, 1),
      node('intro', 'message', 1, 1, {
        text: 'Здравствуйте! 👋 Оставьте заявку, и мы свяжемся с вами.',
        buttons: [btn('go', '📝 Оставить заявку')]
      }),
      ask('askName', 2, 1, 'Как вас зовут?', 'name'),
      ask('askPhone', 3, 1, 'Ваш телефон для связи:', 'phone'),
      ask('askText', 4, 1, 'Коротко опишите, что вам нужно:', 'request'),
      setTag('tag', 5, 1, 'заявка', color, 'add'),
      node('notify', 'sendToChat', 6, 1, {
        targetType: 'group',
        text: '🆕 Новая заявка\nИмя: {{name}}\nТелефон: {{phone}}\nЗапрос: {{request}}'
      }),
      node('done', 'message', 7, 1, { text: 'Спасибо, {{name}}! Заявка принята ✅ Мы скоро свяжемся.' }),
      note('hint', 6, 2.1, 'Выберите в блоке «Отправить в чат» группу или канал, куда присылать заявки. Пока не выбрано — шаг пропускается.')
    ],
    edges: [
      edge('start', 'intro'),
      edge('intro', 'askName', 'btn-go'),
      edge('askName', 'askPhone'),
      edge('askPhone', 'askText'),
      edge('askText', 'tag'),
      edge('tag', 'notify'),
      edge('notify', 'done')
    ],
    variableDefs: [varDef('name'), varDef('phone'), varDef('request')],
    tagDefs: [tagDef('заявка', color)]
  };
}

// title/icon/gradient — для карточек мастера
export const STARTER_TEMPLATES = [
  { id: 'menu', title: 'Меню с кнопками', icon: '🔢', gradient: 'linear-gradient(135deg,#4f9bff,#6b7bff)', build: menu },
  { id: 'subscribe', title: 'Подписка на рассылки', icon: '✉️', gradient: 'linear-gradient(135deg,#a66bff,#cfa6ff)', build: subscribe },
  { id: 'event', title: 'Запись на мероприятие', icon: '📅', gradient: 'linear-gradient(135deg,#ff5f7a,#ff8f8f)', build: event },
  { id: 'schedule', title: 'Рассылка по расписанию', icon: '🕒', gradient: 'linear-gradient(135deg,#ff8a3d,#ffb347)', build: schedule },
  { id: 'quiz', title: 'Тест с баллами', icon: '🎓', gradient: 'linear-gradient(135deg,#10c28a,#34d9a4)', build: quiz },
  { id: 'leads', title: 'Сбор заявок', icon: '🗂', gradient: 'linear-gradient(135deg,#18c5e8,#62e3f3)', build: leads }
];
