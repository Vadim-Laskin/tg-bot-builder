import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { supabase } from '../lib/supabaseClient.js';

// Postgres tables (see supabase/schema.sql):
//   bots(id, user_id, name, telegram_token, groq_api_key, variable_defs,
//        tag_defs, global_variables, global_tags, created_at)
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
    platform: row.platform ?? 'telegram', // 'telegram' | 'vk'
    telegramToken: row.telegram_token ?? '',
    vkGroupId: row.vk_group_id ?? '',
    vkToken: row.vk_token ?? '',
    vkSecret: row.vk_secret ?? '',
    vkConfirmation: row.vk_confirmation ?? '',
    groqApiKey: row.groq_api_key ?? '',
    status: row.status ?? 'active', // 'active' | 'frozen' | 'disabled' — меняет только админ
    statusReason: row.status_reason ?? '',
    createdAt: row.created_at,
    variableDefs: row.variable_defs ?? [], // [{id, name, scope}]
    tagDefs: row.tag_defs ?? [], // [{id, name, color, scope}]
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

  // extra: строка (токен Telegram — как раньше) или { platform, telegramToken, vkGroupId, vkToken, vkSecret }
  async createBot(name, extra = {}) {
    const opts = typeof extra === 'string' ? { telegramToken: extra } : extra ?? {};
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: botRow, error } = await supabase
      .from('bots')
      .insert({
        name: name?.trim() || 'Новый бот',
        user_id: user.id,
        platform: opts.platform ?? 'telegram',
        telegram_token: opts.telegramToken ?? '',
        vk_group_id: opts.vkGroupId ?? '',
        vk_token: opts.vkToken ?? '',
        vk_secret: opts.vkSecret ?? ''
      })
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

  // Puts a ready-made graph (+ the variables/tags its blocks refer to) into
  // the bot's main flow. Used by the new-bot wizard's template picker.
  async applyStarterGraph(botId, { nodes, edges, variableDefs = [], tagDefs = [] }) {
    const bot = get().bots.find((b) => b.id === botId);
    const flow = bot?.flows.find((f) => f.isMain) ?? bot?.flows[0];
    if (!bot || !flow) return false;

    const merge = (old, add) => [...old, ...add.filter((d) => !old.some((o) => o.id === d.id))];
    const nextVars = merge(bot.variableDefs, variableDefs);
    const nextTags = merge(bot.tagDefs, tagDefs);

    set((s) => ({
      bots: s.bots.map((b) =>
        b.id !== botId
          ? b
          : {
              ...b,
              variableDefs: nextVars,
              tagDefs: nextTags,
              flows: b.flows.map((f) => (f.id === flow.id ? { ...f, nodes, edges } : f))
            }
      )
    }));

    const [flowRes, botRes] = await Promise.all([
      supabase.from('flows').update({ graph: { nodes, edges } }).eq('id', flow.id),
      supabase.from('bots').update({ variable_defs: nextVars, tag_defs: nextTags }).eq('id', botId)
    ]);
    if (flowRes.error) console.error('applyStarterGraph (flow):', flowRes.error.message);
    if (botRes.error) console.error('applyStarterGraph (bot):', botRes.error.message);
    return !flowRes.error && !botRes.error;
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

  async setBotSecrets(botId, { telegramToken, groqApiKey, vkToken, vkGroupId, vkConfirmation }) {
    set((s) => ({
      bots: s.bots.map((b) =>
        b.id === botId
          ? {
              ...b,
              telegramToken: telegramToken ?? b.telegramToken,
              groqApiKey: groqApiKey ?? b.groqApiKey,
              vkToken: vkToken ?? b.vkToken,
              vkGroupId: vkGroupId ?? b.vkGroupId,
              vkConfirmation: vkConfirmation ?? b.vkConfirmation
            }
          : b
      )
    }));
    const patch = {};
    if (telegramToken !== undefined) patch.telegram_token = telegramToken;
    if (groqApiKey !== undefined) patch.groq_api_key = groqApiKey;
    if (vkToken !== undefined) patch.vk_token = vkToken;
    if (vkGroupId !== undefined) patch.vk_group_id = vkGroupId;
    if (vkConfirmation !== undefined) patch.vk_confirmation = vkConfirmation;
    const { error } = await supabase.from('bots').update(patch).eq('id', botId);
    if (error) console.error('setBotSecrets:', error.message);
  },

  async createVariable(botId, { name, scope }) {
    const bot = get().bots.find((b) => b.id === botId);
    const def = { id: nanoid(6), name: name.trim(), scope };
    const next = [...(bot?.variableDefs ?? []), def];
    set((s) => ({ bots: s.bots.map((b) => (b.id === botId ? { ...b, variableDefs: next } : b)) }));
    const { error } = await supabase.from('bots').update({ variable_defs: next }).eq('id', botId);
    if (error) console.error('createVariable:', error.message);
    return def.id;
  },

  async deleteVariable(botId, variableId) {
    const bot = get().bots.find((b) => b.id === botId);
    const next = (bot?.variableDefs ?? []).filter((v) => v.id !== variableId);
    set((s) => ({ bots: s.bots.map((b) => (b.id === botId ? { ...b, variableDefs: next } : b)) }));
    const { error } = await supabase.from('bots').update({ variable_defs: next }).eq('id', botId);
    if (error) console.error('deleteVariable:', error.message);
  },

  async createTag(botId, { name, color, scope }) {
    const bot = get().bots.find((b) => b.id === botId);
    const def = { id: nanoid(6), name: name.trim(), color, scope };
    const next = [...(bot?.tagDefs ?? []), def];
    set((s) => ({ bots: s.bots.map((b) => (b.id === botId ? { ...b, tagDefs: next } : b)) }));
    const { error } = await supabase.from('bots').update({ tag_defs: next }).eq('id', botId);
    if (error) console.error('createTag:', error.message);
    return def.id;
  },

  async deleteTag(botId, tagId) {
    const bot = get().bots.find((b) => b.id === botId);
    const next = (bot?.tagDefs ?? []).filter((t) => t.id !== tagId);
    set((s) => ({ bots: s.bots.map((b) => (b.id === botId ? { ...b, tagDefs: next } : b)) }));
    const { error } = await supabase.from('bots').update({ tag_defs: next }).eq('id', botId);
    if (error) console.error('deleteTag:', error.message);
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

  // Кладёт шаблон в уже существующего бота, ничего не стирая.
  // mode 'main'  — блоки добавляются в основной сценарий ниже уже имеющихся;
  // mode 'chain' — шаблон становится отдельной цепочкой (подключается блоком «Цепочка»).
  async addTemplateToBot(botId, tpl, mode = 'main') {
    const bot = get().bots.find((b) => b.id === botId);
    const main = bot?.flows.find((f) => f.isMain) ?? bot?.flows[0];
    if (!bot || !main) return false;

    const merge = (old, add) => [...old, ...(add ?? []).filter((d) => !old.some((o) => o.id === d.id))];
    const nextVars = merge(bot.variableDefs, tpl.variableDefs);
    const nextTags = merge(bot.tagDefs, tpl.tagDefs);

    if (mode === 'chain') {
      const id = await get().importGraphIntoNewFlow(botId, {
        name: tpl.name,
        nodes: structuredClone(tpl.nodes),
        edges: structuredClone(tpl.edges)
      });
      if (!id) return false;
    } else {
      // новые id, чтобы блоки шаблона не столкнулись с уже существующими
      const prefix = `t${Math.random().toString(36).slice(2, 6)}_`;
      const ids = new Set(tpl.nodes.map((n) => n.id));
      const bottom = main.nodes.reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + 260), 0);
      const top = tpl.nodes.reduce((m, n) => Math.min(m, n.position?.y ?? 0), Infinity);
      const nodes = tpl.nodes.map((n) => {
        const data = structuredClone(n.data);
        if (data.targetNodeId && ids.has(data.targetNodeId)) data.targetNodeId = prefix + data.targetNodeId;
        return { ...structuredClone(n), id: prefix + n.id, data, position: { x: n.position.x, y: n.position.y - top + bottom } };
      });
      const edges = tpl.edges.map((e) => ({ ...structuredClone(e), id: prefix + e.id, source: prefix + e.source, target: prefix + e.target }));
      get().updateFlowGraph(botId, main.id, { nodes: [...main.nodes, ...nodes], edges: [...main.edges, ...edges] });
    }

    set((st) => ({ bots: st.bots.map((b) => (b.id === botId ? { ...b, variableDefs: nextVars, tagDefs: nextTags } : b)) }));
    const { error } = await supabase.from('bots').update({ variable_defs: nextVars, tag_defs: nextTags }).eq('id', botId);
    if (error) console.error('addTemplateToBot:', error.message);
    return true;
  },

  getActiveBot() {
    return get().bots.find((b) => b.id === get().activeBotId) ?? null;
  },

  getActiveFlow() {
    const bot = get().bots.find((b) => b.id === get().activeBotId);
    return bot?.flows.find((f) => f.id === get().activeFlowId) ?? null;
  }
}));
