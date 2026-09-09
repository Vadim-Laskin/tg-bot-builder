import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient.js';

// Table `templates` — see supabase/schema.sql. Row Level Security enforces
// the admin-only write rule server-side (auth.uid() must have profiles.is_admin
// = true), so `isAdmin` in the UI is just for hiding buttons, not the real gate.

function mapTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    nodes: row.graph?.nodes ?? [],
    edges: row.graph?.edges ?? []
  };
}

export const useTemplateStore = create((set, get) => ({
  templates: [],
  loading: false,

  async fetchTemplates() {
    set({ loading: true });
    const { data, error } = await supabase.from('templates').select('*').order('created_at', { ascending: true });
    if (error) {
      console.error('fetchTemplates:', error.message);
      set({ loading: false });
      return;
    }
    set({ templates: data.map(mapTemplate), loading: false });
  },

  async addTemplate({ name, description, nodes, edges }) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('templates')
      .insert({ name, description, graph: { nodes, edges }, created_by: user?.id })
      .select()
      .single();
    if (error) {
      console.error('addTemplate:', error.message);
      return null;
    }
    const tpl = mapTemplate(data);
    set((s) => ({ templates: [...s.templates, tpl] }));
    return tpl.id;
  },

  async removeTemplate(id) {
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) console.error('removeTemplate:', error.message);
  },

  getTemplate(id) {
    return get().templates.find((t) => t.id === id) ?? null;
  }
}));
