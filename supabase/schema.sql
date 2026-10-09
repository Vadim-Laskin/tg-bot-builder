-- Flowbase — схема Supabase.
-- Выполнить целиком в Supabase Dashboard → SQL Editor → New query → Run.

-- 1. Профиль пользователя (роль admin живёт здесь, не в токене)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- профили для тех, кто зарегистрировался до появления триггера выше
-- (без строки в profiles приложение не находит профиль и пишет 406)
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 2. Боты
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  telegram_token text not null default '',
  groq_api_key text not null default '',
  variable_defs jsonb not null default '[]'::jsonb, -- [{id, name, scope: 'personal'|'global'}]
  tag_defs jsonb not null default '[]'::jsonb, -- [{id, name, color, scope: 'personal'|'global'}]
  global_variables jsonb not null default '{}'::jsonb, -- values for scope='global' variables, shared by every chat
  global_tags jsonb not null default '[]'::jsonb, -- tag names for scope='global' tags currently "on" for everyone
  created_at timestamptz not null default now()
);

-- if you ran an earlier version of this file, these add the new columns
-- without touching your existing rows
alter table public.bots add column if not exists variable_defs jsonb not null default '[]'::jsonb;
alter table public.bots add column if not exists tag_defs jsonb not null default '[]'::jsonb;
alter table public.bots add column if not exists global_variables jsonb not null default '{}'::jsonb;
alter table public.bots add column if not exists global_tags jsonb not null default '[]'::jsonb;

-- 3. Флоу (у бота: 1 основной + сколько угодно цепочек)
create table if not exists public.flows (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  name text not null,
  is_main boolean not null default false,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Шаблоны (публичное чтение, запись только админам)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.bots enable row level security;
alter table public.flows enable row level security;
alter table public.templates enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "bots: owner full access" on public.bots;
create policy "bots: owner full access" on public.bots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "flows: owner via bot" on public.flows;
create policy "flows: owner via bot" on public.flows
  for all using (
    exists (select 1 from public.bots b where b.id = flows.bot_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.bots b where b.id = flows.bot_id and b.user_id = auth.uid())
  );

drop policy if exists "templates: everyone can read" on public.templates;
create policy "templates: everyone can read" on public.templates
  for select using (true);

drop policy if exists "templates: admins can write" on public.templates;
create policy "templates: admins can write" on public.templates
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "templates: admins can update" on public.templates;
create policy "templates: admins can update" on public.templates
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "templates: admins can delete" on public.templates;
create policy "templates: admins can delete" on public.templates
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------- Как стать админом (для теста) ----------
-- После первой регистрации выполните в SQL Editor, подставив свой email:
--
-- update public.profiles set is_admin = true where email = 'you@example.com';

-- 5. Состояние диалога (переменные + теги на чат), пишет только вебхук
--    (service role, в обход RLS). Владелец бота может читать — например,
--    для будущей отладки в UI.
create table if not exists public.chat_state (
  bot_id uuid not null references public.bots(id) on delete cascade,
  chat_id text not null,
  variables jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  message_ids jsonb not null default '{}'::jsonb,
  pending_choices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (bot_id, chat_id)
);

-- if you ran an earlier version of this file, this adds the new columns
-- without touching your existing rows
alter table public.chat_state add column if not exists message_ids jsonb not null default '{}'::jsonb;
alter table public.chat_state add column if not exists pending_choices jsonb not null default '{}'::jsonb;
alter table public.chat_state add column if not exists display_name text;
alter table public.chat_state add column if not exists username text;
alter table public.chat_state add column if not exists chat_type text;
alter table public.chat_state add column if not exists pending_keyboard jsonb not null default '{}'::jsonb;
alter table public.chat_state add column if not exists pending_capture jsonb;

alter table public.chat_state enable row level security;

drop policy if exists "chat_state: owner can read" on public.chat_state;
create policy "chat_state: owner can read" on public.chat_state
  for select using (
    exists (select 1 from public.bots b where b.id = chat_state.bot_id and b.user_id = auth.uid())
  );
-- Намеренно нет insert/update/delete политик для anon/authenticated —
-- писать может только service role (вебхук), который обходит RLS.

-- 6. История сообщений (для профиля пользователя бота), пишет только вебхук
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  bot_id uuid not null references public.bots(id) on delete cascade,
  chat_id text not null,
  direction text not null check (direction in ('in', 'out')),
  text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_bot_chat_idx on public.chat_messages (bot_id, chat_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages: owner can read" on public.chat_messages;
create policy "chat_messages: owner can read" on public.chat_messages
  for select using (
    exists (select 1 from public.bots b where b.id = chat_messages.bot_id and b.user_id = auth.uid())
  );

-- 7. Группы/каналы, куда добавлен бот — список + настройка "отвечать/не отвечать"
create table if not exists public.bot_chats (
  bot_id uuid not null references public.bots(id) on delete cascade,
  chat_id text not null,
  title text not null default '',
  type text not null default 'group', -- group | supergroup | channel
  is_enabled boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (bot_id, chat_id)
);

alter table public.bot_chats enable row level security;

drop policy if exists "bot_chats: owner can read" on public.bot_chats;
create policy "bot_chats: owner can read" on public.bot_chats
  for select using (
    exists (select 1 from public.bots b where b.id = bot_chats.bot_id and b.user_id = auth.uid())
  );

-- owner can flip is_enabled from the UI directly (not security-sensitive,
-- unlike chat_state/chat_messages, so no need to route this through the
-- webhook's service role)
drop policy if exists "bot_chats: owner can update" on public.bot_chats;
create policy "bot_chats: owner can update" on public.bot_chats
  for update using (
    exists (select 1 from public.bots b where b.id = bot_chats.bot_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.bots b where b.id = bot_chats.bot_id and b.user_id = auth.uid())
  );

-- ---------- ВКонтакте: второй мессенджер ----------
-- platform: 'telegram' | 'vk'. У VK-бота токена Telegram нет, а вместо него —
-- ключ доступа сообщества (vk_token), id сообщества и секрет, которым VK
-- подписывает свои события (vk_secret).
alter table public.bots add column if not exists platform text not null default 'telegram'
  check (platform in ('telegram', 'vk'));
alter table public.bots add column if not exists vk_group_id text not null default '';
alter table public.bots add column if not exists vk_token text not null default '';
alter table public.bots add column if not exists vk_secret text not null default '';
-- id последнего обработанного события VK: повторную доставку того же события пропускаем
alter table public.chat_state add column if not exists last_event_id text;

-- ВКонтакте: строка подтверждения Callback API, если сервер подключён вручную
-- (когда ключ не может настроить Callback API через API — ошибка 1051)
alter table public.bots add column if not exists vk_confirmation text not null default '';

-- =====================================================================
-- Админка: роли, блокировка пользователей, заморозка/отключение ботов.
-- Админ видит чужие данные только через функции ниже (security definer):
-- токены и ключи ботов в них не возвращаются.
-- =====================================================================

alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists admin_note text not null default '';
alter table public.profiles add column if not exists blocked boolean not null default false;

-- статус бота: active — работает; frozen — заморожен (бот молчит, владелец может править);
-- disabled — отключён админом (бот молчит, владелец не может ни править, ни включить)
alter table public.bots add column if not exists status text not null default 'active';
alter table public.bots add column if not exists status_reason text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bots_status_check') then
    alter table public.bots add constraint bots_status_check check (status in ('active', 'frozen', 'disabled'));
  end if;
end $$;

-- шаблон хранит и переменные/теги, которые нужны его блокам
alter table public.templates add column if not exists variable_defs jsonb not null default '[]'::jsonb;
alter table public.templates add column if not exists tag_defs jsonb not null default '[]'::jsonb;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- владелец не может сам разморозить бота; у отключённого бота нельзя править даже поля
create or replace function public.protect_bot_admin_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- вебхуки (service role) и SQL Editor идут без пользователя; админам можно всё
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.status is distinct from old.status or new.status_reason is distinct from old.status_reason then
    raise exception 'Статус бота меняет только администратор';
  end if;
  if old.status = 'disabled' then
    raise exception 'Бот отключён администратором';
  end if;
  return new;
end;
$$;

drop trigger if exists bots_protect_admin_columns on public.bots;
create trigger bots_protect_admin_columns
  before update on public.bots
  for each row execute function public.protect_bot_admin_columns();

-- сценарии отключённого бота тоже заперты
create or replace function public.protect_flows_of_disabled_bot()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bid uuid;
  st text;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then bid := old.bot_id; else bid := new.bot_id; end if;
  select b.status into st from public.bots b where b.id = bid;
  if st = 'disabled' then
    raise exception 'Бот отключён администратором';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists flows_protect_disabled_bot on public.flows;
create trigger flows_protect_disabled_bot
  before insert or update or delete on public.flows
  for each row execute function public.protect_flows_of_disabled_bot();

-- список пользователей (для не-админа вернёт пустоту)
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, display_name text, admin_note text,
  is_admin boolean, blocked boolean, created_at timestamptz, bots_count bigint
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.display_name, p.admin_note, p.is_admin, p.blocked, p.created_at,
         (select count(*) from public.bots b where b.user_id = p.id)
  from public.profiles p
  where public.is_admin()
  order by p.created_at desc;
$$;

-- список ботов без токенов и ключей
create or replace function public.admin_list_bots()
returns table (
  id uuid, name text, platform text, status text, status_reason text,
  user_id uuid, owner_email text, created_at timestamptz, flows_count bigint, has_token boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.platform, b.status, b.status_reason, b.user_id, p.email, b.created_at,
         (select count(*) from public.flows f where f.bot_id = b.id),
         (case when b.platform = 'vk' then b.vk_token <> '' else b.telegram_token <> '' end)
  from public.bots b
  left join public.profiles p on p.id = b.user_id
  where public.is_admin()
  order by b.created_at desc;
$$;

create or replace function public.admin_update_profile(
  p_user uuid, p_display_name text, p_admin_note text, p_is_admin boolean, p_blocked boolean
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;
  if p_user = auth.uid() and (p_is_admin is false or p_blocked is true) then
    raise exception 'Нельзя забрать у себя права админа или заблокировать себя';
  end if;

  update public.profiles
     set display_name = coalesce(p_display_name, display_name),
         admin_note   = coalesce(p_admin_note, admin_note),
         is_admin     = coalesce(p_is_admin, is_admin),
         blocked      = coalesce(p_blocked, blocked)
   where id = p_user;

  -- блокировка аккаунта замораживает его ботов; разблокировка возвращает те,
  -- что были заморожены именно из-за блокировки
  if p_blocked is true then
    update public.bots set status = 'frozen', status_reason = 'Аккаунт заблокирован'
     where user_id = p_user and status = 'active';
  elsif p_blocked is false then
    update public.bots set status = 'active', status_reason = ''
     where user_id = p_user and status = 'frozen' and status_reason = 'Аккаунт заблокирован';
  end if;
end;
$$;

create or replace function public.admin_set_bot_status(p_bot uuid, p_status text, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;
  if p_status not in ('active', 'frozen', 'disabled') then
    raise exception 'Неизвестный статус';
  end if;
  update public.bots
     set status = p_status,
         status_reason = case when p_status = 'active' then '' else coalesce(p_reason, '') end
   where id = p_bot;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_bots() to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.admin_set_bot_status(uuid, text, text) to authenticated;

-- =====================================================================
-- Рассылки: только личные чаты людей, которые сами писали боту.
-- Группы, беседы и каналы в получатели не попадают.
-- Пишет только серверная функция broadcast (service role); владелец бота читает.
-- =====================================================================

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  text text not null,
  audience text not null default 'all' check (audience in ('all', 'tag')),
  tag text not null default '',
  status text not null default 'sending' check (status in ('sending', 'done', 'cancelled')),
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists broadcasts_bot_idx on public.broadcasts (bot_id, created_at desc);

create table if not exists public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  chat_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text not null default '',
  primary key (broadcast_id, chat_id)
);

create index if not exists broadcast_recipients_pending_idx on public.broadcast_recipients (broadcast_id, status);

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists "broadcasts: owner can read" on public.broadcasts;
create policy "broadcasts: owner can read" on public.broadcasts
  for select using (
    exists (select 1 from public.bots b where b.id = broadcasts.bot_id and b.user_id = auth.uid())
  );
-- insert/update/delete и вся таблица получателей — только service role (функция broadcast)
