-- Rawad's League Supabase setup
--
-- HOW TO RUN:
-- 1. Run SECTION 1 and SECTION 2 first.
-- 2. Create Rawad's Auth user in the Supabase Dashboard.
-- 3. Copy Rawad's user UUID.
-- 4. Replace YOUR_RAWAD_USER_UUID in SECTION 3.
-- 5. Run SECTION 3.

-- ============================================================
-- SECTION 1: Tables, indexes, triggers, default settings
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.league_settings (
  id integer primary key default 1 check (id = 1),
  league_name text not null default 'Rawad''s League',
  league_subtitle text not null default 'Every action has consequences.',
  updated_at timestamp with time zone not null default now()
);

insert into public.league_settings (id, league_name, league_subtitle)
values (1, 'Rawad''s League', 'Every action has consequences.')
on conflict (id) do nothing;

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  nickname text,
  emoji text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  points integer not null check (points <> 0),
  reason text not null check (length(trim(reason)) > 0),
  event_date timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists point_events_friend_id_idx on public.point_events(friend_id);
create index if not exists point_events_event_date_idx on public.point_events(event_date desc);
create index if not exists point_events_created_at_idx on public.point_events(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_league_settings_updated_at on public.league_settings;
create trigger set_league_settings_updated_at
before update on public.league_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_friends_updated_at on public.friends;
create trigger set_friends_updated_at
before update on public.friends
for each row execute function public.set_updated_at();

drop trigger if exists set_point_events_updated_at on public.point_events;
create trigger set_point_events_updated_at
before update on public.point_events
for each row execute function public.set_updated_at();

-- Realtime support. If the tables are already added, these blocks safely do nothing.
do $$
begin
  alter publication supabase_realtime add table public.league_settings;
exception
  when duplicate_object or undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.friends;
exception
  when duplicate_object or undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.point_events;
exception
  when duplicate_object or undefined_object then null;
end;
$$;

-- ============================================================
-- SECTION 2: Row Level Security and public read access
-- ============================================================

alter table public.league_settings enable row level security;
alter table public.friends enable row level security;
alter table public.point_events enable row level security;

drop policy if exists "Public can read league settings" on public.league_settings;
create policy "Public can read league settings"
on public.league_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read friends" on public.friends;
create policy "Public can read friends"
on public.friends
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read point events" on public.point_events;
create policy "Public can read point events"
on public.point_events
for select
to anon, authenticated
using (true);

-- ============================================================
-- SECTION 3: Rawad admin write access
-- Replace YOUR_RAWAD_USER_UUID before running this section.
-- ============================================================

create or replace function public.is_rawad_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.uid()::text = 'YOUR_RAWAD_USER_UUID', false);
$$;

drop policy if exists "Rawad can update league settings" on public.league_settings;
create policy "Rawad can update league settings"
on public.league_settings
for update
to authenticated
using (public.is_rawad_admin())
with check (public.is_rawad_admin() and id = 1);

drop policy if exists "Rawad can insert friends" on public.friends;
create policy "Rawad can insert friends"
on public.friends
for insert
to authenticated
with check (public.is_rawad_admin());

drop policy if exists "Rawad can update friends" on public.friends;
create policy "Rawad can update friends"
on public.friends
for update
to authenticated
using (public.is_rawad_admin())
with check (public.is_rawad_admin());

drop policy if exists "Rawad can delete friends" on public.friends;
create policy "Rawad can delete friends"
on public.friends
for delete
to authenticated
using (public.is_rawad_admin());

drop policy if exists "Rawad can insert point events" on public.point_events;
create policy "Rawad can insert point events"
on public.point_events
for insert
to authenticated
with check (public.is_rawad_admin());

drop policy if exists "Rawad can update point events" on public.point_events;
create policy "Rawad can update point events"
on public.point_events
for update
to authenticated
using (public.is_rawad_admin())
with check (public.is_rawad_admin());

drop policy if exists "Rawad can delete point events" on public.point_events;
create policy "Rawad can delete point events"
on public.point_events
for delete
to authenticated
using (public.is_rawad_admin());
