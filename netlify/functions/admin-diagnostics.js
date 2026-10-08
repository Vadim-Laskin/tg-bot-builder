// Диагностика для админки: что настроено на сервере, сколько чего в базе,
// достижимы ли внешние API. Только для админов (проверяем по JWT).
//
//   POST (без тела) → { env, site, db, external, time }

import { createClient } from '@supabase/supabase-js';

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });

async function ping(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { ok: true, status: r.status, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t };
  }
}

async function main(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return json(401, { error: 'не авторизовано' });

  // админ ли это — проверяем от имени самого пользователя (RLS отдаёт ему его профиль)
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const {
    data: { user }
  } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return json(401, { error: 'не авторизовано' });
  const { data: me } = await userClient.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!me?.is_admin) return json(403, { error: 'только для администраторов' });

  const has = (k) => Boolean(process.env[k]);
  const env = {
    SUPABASE_URL: has('SUPABASE_URL'),
    SUPABASE_ANON_KEY: has('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
    VITE_VK_APP_ID: has('VITE_VK_APP_ID') || has('VK_APP_ID'),
    VK_SERVICE_KEY: has('VK_SERVICE_KEY')
  };

  let db = { ok: false, error: 'не задан SUPABASE_SERVICE_ROLE_KEY' };
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const t = Date.now();
    const [profiles, bots, templates] = await Promise.all([
      admin.from('profiles').select('is_admin, blocked'),
      admin.from('bots').select('platform, status, telegram_token, vk_token'),
      admin.from('templates').select('id', { count: 'exact', head: true })
    ]);
    const failed = profiles.error || bots.error || templates.error;
    if (failed) {
      db = { ok: false, error: failed.message };
    } else {
      const count = (rows, key) => rows.reduce((m, r) => ({ ...m, [r[key] ?? 'unknown']: (m[r[key] ?? 'unknown'] ?? 0) + 1 }), {});
      db = {
        ok: true,
        ms: Date.now() - t,
        users: profiles.data.length,
        admins: profiles.data.filter((p) => p.is_admin).length,
        blockedUsers: profiles.data.filter((p) => p.blocked).length,
        bots: {
          total: bots.data.length,
          byPlatform: count(bots.data, 'platform'),
          byStatus: count(bots.data, 'status'),
          withoutToken: bots.data.filter((b) => !(b.platform === 'vk' ? b.vk_token : b.telegram_token)).length
        },
        templates: templates.count ?? 0
      };
    }
  }

  const [telegram, vk] = await Promise.all([ping('https://api.telegram.org'), ping('https://api.vk.com/method/utils.getServerTime?v=5.199')]);

  return json(200, {
    env,
    site: process.env.URL || null,
    db,
    external: { telegram, vk },
    time: new Date().toISOString()
  });
}

export const handler = async (event) => {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) return json(500, { error: `На Netlify не заданы переменные: ${missing.join(', ')}` });
  try {
    return await main(event);
  } catch (e) {
    console.error('admin-diagnostics crashed:', e);
    return json(500, { error: `Сбой на сервере: ${e.message}` });
  }
};
