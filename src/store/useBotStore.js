import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

// TODO(phase 2 — Supabase): replace the localStorage `persist` middleware
// with Supabase reads/writes (table `bots`, `flows`), keyed by auth user id.
// The shape below is designed to map 1:1 onto Postgres tables:
//   bots(id, user_id, name, created_at)
//   flows(id, bot_id, name, is_main, graph jsonb)

function emptyGraph() {
  return { nodes: [], edges: [] };
}

export const useBotStore = create(
  persist(
    (set, get) => ({
      bots: [],
      activeBotId: null,
      activeFlowId: null,

      createBot(name) {
        const botId = nanoid();
        const flowId = nanoid();
        const bot = {
          id: botId,
          name: name?.trim() || 'Новый бот',
          telegramToken: '',
          groqApiKey: '',
          createdAt: Date.now(),
          flows: [{ id: flowId, name: 'Основной флоу', isMain: true, ...emptyGraph() }]
        };
        set((s) => ({ bots: [...s.bots, bot], activeBotId: botId, activeFlowId: flowId }));
        return botId;
      },

      deleteBot(botId) {
        set((s) => ({
          bots: s.bots.filter((b) => b.id !== botId),
          activeBotId: s.activeBotId === botId ? null : s.activeBotId
        }));
      },

      renameBot(botId, name) {
        set((s) => ({
          bots: s.bots.map((b) => (b.id === botId ? { ...b, name } : b))
        }));
      },

      setBotSecrets(botId, { telegramToken, groqApiKey }) {
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === botId
              ? {
                  ...b,
                  telegramToken: telegramToken ?? b.telegramToken,
                  groqApiKey: groqApiKey ?? b.groqApiKey
                }
              : b
          )
        }));
      },

      setActiveBot(botId) {
        const bot = get().bots.find((b) => b.id === botId);
        const mainFlow = bot?.flows.find((f) => f.isMain) ?? bot?.flows[0];
        set({ activeBotId: botId, activeFlowId: mainFlow?.id ?? null });
      },

      setActiveFlow(flowId) {
        set({ activeFlowId: flowId });
      },

      addChainFlow(botId, name) {
        const flowId = nanoid();
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === botId
              ? { ...b, flows: [...b.flows, { id: flowId, name: name || 'Цепочка', isMain: false, ...emptyGraph() }] }
              : b
          )
        }));
        return flowId;
      },

      updateFlowGraph(botId, flowId, { nodes, edges }) {
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id !== botId
              ? b
              : {
                  ...b,
                  flows: b.flows.map((f) => (f.id === flowId ? { ...f, nodes, edges } : f))
                }
          )
        }));
      },

      importGraphIntoNewFlow(botId, { name, nodes, edges }) {
        const flowId = nanoid();
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === botId
              ? { ...b, flows: [...b.flows, { id: flowId, name, isMain: false, nodes, edges }] }
              : b
          )
        }));
        return flowId;
      },

      getActiveBot() {
        return get().bots.find((b) => b.id === get().activeBotId) ?? null;
      },

      getActiveFlow() {
        const bot = get().bots.find((b) => b.id === get().activeBotId);
        return bot?.flows.find((f) => f.id === get().activeFlowId) ?? null;
      }
    }),
    { name: 'flowbase-bots' }
  )
);
