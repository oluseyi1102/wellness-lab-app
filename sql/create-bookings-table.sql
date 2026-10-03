-- ==========================================================================
-- WellnessLab Diagnostics - `bookings` table
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ==========================================================================

-- 1) Table ------------------------------------------------------------------
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  patient_name   text not null,
  phone_number   text not null,
  address        text,
  preferred_date date,
  test_booked    text not null
);

comment on table  public.bookings             is 'Patient test bookings submitted from the WellnessLab checkout page.';
comment on column public.bookings.test_booked is 'Comma-separated list of the diagnostic test(s)/package booked.';

-- 2) Row Level Security -----------------------------------------------------
-- The browser uses the PUBLIC anon key, so RLS must be ON. Anonymous visitors
-- are allowed to INSERT only (submit a booking) - they can never read, edit,
-- or delete anyone's data. Lab staff read rows via the dashboard/service role,
-- which bypasses RLS.
alter table public.bookings enable row level security;

drop policy if exists "Allow anonymous booking inserts" on public.bookings;
create policy "Allow anonymous booking inserts"
  on public.bookings
  for insert
  to anon
  with check (true);

-- 3) Data API grants (least privilege) --------------------------------------
grant insert on public.bookings to anon;
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;

-- 4) Handy index for the lab team (newest bookings first) -------------------
create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);
