import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient.js';

// Postgres tables (see supabase/schema.sql):
//   bots(id, user_id, name, telegram_token, groq_api_key, created_at)
//   flows(id, bot_id, name, is_main, graph jsonb, created_at)
// `graph` holds { nodes, edges } together; mapFlow/mapBot flatten that
// into the shape the editor components already expect.

function mapFlow(row) {
  return {
    id: row.id,
    name: row.name,
    isMain: row.is_main,
    nodes: row.graph?.nodes ?? [],
    edges: row.graph?.edges ?? []
  };
}

function mapBot(row) {
  return {
    id: row.id,
    name: row.name,
    telegramToken: row.telegram_token ?? '',
    groqApiKey: row.groq_api_key ?? '',
    createdAt: row.created_at,
    flows: (row.flows ?? []).map(mapFlow).sort((a, b) => Number(b.isMain) - Number(a.isMain))
  };
}

export const useBotStore = create((set, get) => ({
  bots: [],
  activeBotId: null,
  activeFlowId: null,
  loading: false,

  async fetchBots() {
    set({ loading: true });
    const { data, error } = await supabase
      .from('bots')
      .select('*, flows(*)')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('fetchBots:', error.message);
      set({ loading: false });
      return;
    }
    set({ bots: data.map(mapBot), loading: false });
  },

  async createBot(name) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: botRow, error } = await supabase
      .from('bots')
      .insert({ name: name?.trim() || 'Новый бот', user_id: user.id })
      .select()
      .single();
    if (error) {
      console.error('createBot:', error.message);
      return null;
    }

    const { data: flowRow, error: flowErr } = await supabase
      .from('flows')
      .insert({ bot_id: botRow.id, name: 'Основной флоу', is_main: true, graph: { nodes: [], edges: [] } })
      .select()
      .single();
    if (flowErr) {
      console.error('createBot (main flow):', flowErr.message);
      return null;
    }

    const bot = mapBot({ ...botRow, flows: [flowRow] });
    set((s) => ({ bots: [...s.bots, bot], activeBotId: bot.id, activeFlowId: bot.flows[0].id }));
    return bot.id;
  },

  async deleteBot(botId) {
    set((s) => ({
      bots: s.bots.filter((b) => b.id !== botId),
      activeBotId: s.activeBotId === botId ? null : s.activeBotId
    }));
    const { error } = await supabase.from('bots').delete().eq('id', botId);
    if (error) console.error('deleteBot:', error.message);
  },

  async renameBot(botId, name) {
    set((s) => ({ bots: s.bots.map((b) => (b.id === botId ? { ...b, name } : b)) }));
    const { error } = await supabase.from('bots').update({ name }).eq('id', botId);
    if (error) console.error('renameBot:', error.message);
  },

  async setBotSecrets(botId, { telegramToken, groqApiKey }) {
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
    const patch = {};
    if (telegramToken !== undefined) patch.telegram_token = telegramToken;
    if (groqApiKey !== undefined) patch.groq_api_key = groqApiKey;
    const { error } = await supabase.from('bots').update(patch).eq('id', botId);
    if (error) console.error('setBotSecrets:', error.message);
  },

  setActiveBot(botId) {
    const bot = get().bots.find((b) => b.id === botId);
    const mainFlow = bot?.flows.find((f) => f.isMain) ?? bot?.flows[0];
    set({ activeBotId: botId, activeFlowId: mainFlow?.id ?? null });
  },

  setActiveFlow(flowId) {
    set({ activeFlowId: flowId });
  },

  async addChainFlow(botId, name) {
    const { data, error } = await supabase
      .from('flows')
      .insert({ bot_id: botId, name: name || 'Цепочка', is_main: false, graph: { nodes: [], edges: [] } })
      .select()
      .single();
    if (error) {
      console.error('addChainFlow:', error.message);
      return null;
    }
    const flow = mapFlow(data);
    set((s) => ({
      bots: s.bots.map((b) => (b.id === botId ? { ...b, flows: [...b.flows, flow] } : b))
    }));
    return flow.id;
  },

  async renameFlow(botId, flowId, name) {
    set((s) => ({
      bots: s.bots.map((b) =>
        b.id !== botId ? b : { ...b, flows: b.flows.map((f) => (f.id === flowId ? { ...f, name } : f)) }
      )
    }));
    const { error } = await supabase.from('flows').update({ name }).eq('id', flowId);
    if (error) console.error('renameFlow:', error.message);
  },

  // Optimistic + fire-and-forget: the canvas already debounces calls to
  // this on every graph change, so we don't want to await a network
  // round-trip per keystroke/drag.
  updateFlowGraph(botId, flowId, { nodes, edges }) {
    set((s) => ({
      bots: s.bots.map((b) =>
        b.id !== botId
          ? b
          : { ...b, flows: b.flows.map((f) => (f.id === flowId ? { ...f, nodes, edges } : f)) }
      )
    }));
    supabase
      .from('flows')
      .update({ graph: { nodes, edges } })
      .eq('id', flowId)
      .then(({ error }) => {
        if (error) console.error('updateFlowGraph:', error.message);
      });
  },

  async importGraphIntoNewFlow(botId, { name, nodes, edges }) {
    const { data, error } = await supabase
      .from('flows')
      .insert({ bot_id: botId, name, is_main: false, graph: { nodes, edges } })
      .select()
      .single();
    if (error) {
      console.error('importGraphIntoNewFlow:', error.message);
      return null;
    }
    const flow = mapFlow(data);
    set((s) => ({
      bots: s.bots.map((b) => (b.id === botId ? { ...b, flows: [...b.flows, flow] } : b))
    }));
    return flow.id;
  },

  getActiveBot() {
    return get().bots.find((b) => b.id === get().activeBotId) ?? null;
  },

  getActiveFlow() {
    const bot = get().bots.find((b) => b.id === get().activeBotId);
    return bot?.flows.find((f) => f.id === get().activeFlowId) ?? null;
  }
}));
