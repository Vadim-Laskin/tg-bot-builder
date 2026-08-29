import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// TODO(phase 2 — Supabase): table `templates(id, name, description, graph jsonb,
// created_by, created_at)`. Writes should be gated server-side by an
// `is_admin` flag on the user's profile row (Row Level Security policy),
// not just hidden in the UI like the `isAdmin` flag below.

const STARTER_TEMPLATES = [
  {
    id: 'starter-welcome',
    name: 'Приветствие + меню',
    description: 'Команда /start отвечает текстом и двумя кнопками.',
    nodes: [
      { id: 'e1', type: 'event', position: { x: 0, y: 0 }, data: { triggerType: 'command', value: '/start' } },
      {
        id: 'm1',
        type: 'message',
        position: { x: 280, y: 0 },
        data: {
          text: 'Привет! Я бот компании. Чем помочь?',
          buttons: [
            { text: 'Каталог', action: 'next', value: '' },
            { text: 'Поддержка', action: 'next', value: '' }
          ]
        }
      }
    ],
    edges: [{ id: 'e1-m1', source: 'e1', target: 'm1' }]
  }
];

export const useTemplateStore = create(
  persist(
    (set, get) => ({
      templates: STARTER_TEMPLATES,
      isAdmin: true, // MVP stub — replace with real auth role in phase 2

      addTemplate({ name, description, nodes, edges }) {
        const template = { id: nanoid(), name, description, nodes, edges };
        set((s) => ({ templates: [...s.templates, template] }));
        return template.id;
      },

      removeTemplate(id) {
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
      },

      getTemplate(id) {
        return get().templates.find((t) => t.id === id) ?? null;
      }
    }),
    { name: 'flowbase-templates' }
  )
);
