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

-- 2. Боты
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  telegram_token text not null default '',
  groq_api_key text not null default '',
  created_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now(),
  primary key (bot_id, chat_id)
);

alter table public.chat_state enable row level security;

drop policy if exists "chat_state: owner can read" on public.chat_state;
create policy "chat_state: owner can read" on public.chat_state
  for select using (
    exists (select 1 from public.bots b where b.id = chat_state.bot_id and b.user_id = auth.uid())
  );
-- Намеренно нет insert/update/delete политик для anon/authenticated —
-- писать может только service role (вебхук), который обходит RLS.
