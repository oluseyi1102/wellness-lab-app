-- ==========================================================================
-- WellnessLab Diagnostics - `profiles` and `cart` tables
-- --------------------------------------------------------------------------
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ==========================================================================

-- ==========================================================================
-- 1) `profiles` (the public, user-facing "users" table)
-- --------------------------------------------------------------------------
-- Supabase already ships a built-in `auth.users` table that stores the login
-- credentials and is what actually powers Google sign-in. We do NOT create a
-- second "users" table for authentication. Instead `profiles` stores public,
-- per-user info (display name, email, avatar) keyed 1-to-1 to the auth user.
-- ==========================================================================
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  email            text,
  avatar_url       text,
  created_at       timestamptz not null default now()
);

-- Auto-create a profile row the moment a user signs up via Google helper.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: a signed-in user may only read / update their OWN profile.
alter table public.profiles enable row level security;

drop policy if exists "Can view own profile" on public.profiles;
create policy "Can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Can update own profile" on public.profiles;
create policy "Can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

comment on table public.profiles is 'Public per-user profile, keyed 1-to-1 to auth.users.';

-- ==========================================================================
-- 2) `cart` (one row per saved cart item, owned by a user)
-- --------------------------------------------------------------------------
-- Guests shop in browser localStorage. When they sign in, cart.js promotes
-- those items into this table automatically (user_id is taken from the
-- signed-in session, never from the request body).
-- ==========================================================================
create table if not exists public.cart (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     text not null,               -- e.g. 'malaria-microscopy' or 'basic-wellness'
  item_type   text not null default 'test',-- 'test' | 'package'
  name        text not null,
  price       integer not null,            -- price in Naira
  image       text,
  meta        text,                        -- e.g. '30 - 45 Mins • Whole Blood'
  quantity    integer not null default 1,
  created_at  timestamptz not null default now(),
  unique (user_id, item_id)
);

-- RLS: every operation is owner-scoped - a user can only touch their own cart.
alter table public.cart enable row level security;

drop policy if exists "Cart is owner-only" on public.cart;
create policy "Cart is owner-only"
  on public.cart for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Data API grants (least privilege).
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select, insert, update, delete on public.cart to authenticated;
grant all on public.cart to service_role;

-- Speed up "get my cart" queries.
create index if not exists cart_user_idx on public.cart (user_id);
create index if not exists cart_user_item_idx on public.cart (user_id, item_id);