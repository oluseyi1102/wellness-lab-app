-- ==========================================================================
-- WellnessLab Diagnostics - ONE-TIME migration for `bookings`
-- ---------------------------------------------------------------------------
-- Fixes: new row violates row-level security policy for table 'bookings'
--        (code 42501) when a SIGNED-IN user clicks "Confirm Booking".
--
-- Why it broke: the only INSERT policy was `to anon`, and the table had no
-- user_id column. A logged-in user's JWT has role "authenticated", so RLS
-- had no policy allowing their insert.
--
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (Safe to re-run: every step is idempotent.)
-- ==========================================================================

-- 1) Make sure RLS is on -----------------------------------------------------
alter table public.bookings enable row level security;

-- 2) Add user_id if the table doesn't have it yet ---------------------------
-- js/checkout.js now sends user_id = the signed-in user's id (null for guests).
alter table public.bookings
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.bookings.user_id
  is 'auth.users id of the signed-in patient; null when a guest booked.';

-- 3) Drop ALL existing policies on the bookings table -----------------------
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
  loop
    execute format('drop policy %I on public.bookings', pol.policyname);
    raise notice 'dropped policy: %', pol.policyname;
  end loop;
end $$;

-- 4) Recreate the correct INSERT policies ------------------------------------
-- Guests (anon role): may book, but the row must not claim any user.
create policy "Allow anonymous booking inserts"
  on public.bookings
  for insert
  to anon
  with check (user_id is null);

-- Signed-in users (authenticated role): may insert their OWN booking.
-- `user_id is null` is a fallback so a booking is never lost if the session
-- could not be read client-side; remove that half if you want the strict
-- rule "authenticated rows must always carry auth.uid()".
create policy "Allow authenticated users to insert their own booking"
  on public.bookings
  for insert
  to authenticated
  with check (user_id is null or (select auth.uid()) = user_id);

-- 5) Make sure the table grants exist (RLS policies AND grants are required -
--    a grant alone does not bypass RLS, and vice versa) ----------------------
grant insert on public.bookings to anon;
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;

-- 6) Index so "my bookings" lookups stay fast --------------------------------
create index if not exists bookings_user_idx on public.bookings (user_id);

-- ==========================================================================
-- Verify (optional):
--   select polname, roles, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'bookings';
-- Expected: 2 rows - both cmd = INSERT, roles = {anon} and {authenticated}.
-- ==========================================================================