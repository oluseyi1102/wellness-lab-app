-- ==========================================================================
-- WellnessLab Diagnostics - `bookings` table
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ==========================================================================

-- 1) Table ------------------------------------------------------------------
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  -- Set by js/checkout.js from the signed-in session; null for guests.
  user_id        uuid references auth.users (id) on delete set null,
  patient_name   text not null,
  phone_number   text not null,
  address        text,
  preferred_date date,
  test_booked    text not null
);

comment on table  public.bookings             is 'Patient test bookings submitted from the WellnessLab checkout page.';
comment on column public.bookings.test_booked is 'Comma-separated list of the diagnostic test(s)/package booked.';
comment on column public.bookings.user_id     is 'auth.users id of the signed-in patient; null when a guest booked.';

-- 2) Row Level Security -----------------------------------------------------
-- The browser uses the PUBLIC anon key, so RLS must be ON.
--   * anon (guests)      : may INSERT a booking that is not attributed to
--                          anyone (user_id is null).
--   * authenticated      : may INSERT a booking attributed to THEMSELVES
--                          (user_id = auth.uid()), or an unattributed one if
--                          the session could not be read - never someone
--                          else's user_id.
-- Nobody can read/edit/delete rows from the browser; lab staff read rows via
-- the dashboard/service role, which bypasses RLS.
alter table public.bookings enable row level security;

-- Drop EVERY existing policy on the table so re-running this file is safe.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
  loop
    execute format('drop policy %I on public.bookings', pol.policyname);
  end loop;
end $$;

create policy "Allow anonymous booking inserts"
  on public.bookings
  for insert
  to anon
  with check (user_id is null);

create policy "Allow authenticated users to insert their own booking"
  on public.bookings
  for insert
  to authenticated
  with check (user_id is null or (select auth.uid()) = user_id);

-- 3) Data API grants (least privilege) --------------------------------------
grant insert on public.bookings to anon;
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;

-- 4) Handy indexes -----------------------------------------------------------
create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);
create index if not exists bookings_user_idx
  on public.bookings (user_id);
