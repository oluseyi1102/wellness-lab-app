/**
 * ==========================================================================
 * WellnessLab Diagnostics - Supabase Configuration Bridge
 * --------------------------------------------------------------------------
 * This site is plain static HTML/CSS/JS (no bundler / no build step), so the
 * browser cannot read the project's `.env` file at runtime. The values below
 * mirror `.env` found at the project root and are the single place the app
 * reads its Supabase credentials from.
 *
 * PUBLIC vs SECRET KEYS
 *   - The `anon` / "publishable" key is PUBLIC by design. It is safe to ship
 *     to the browser because Row Level Security (RLS) on the `bookings` table
 *     only lets an anonymous visitor INSERT a booking.
 *   - NEVER put the `service_role` / secret key in this file. It bypasses RLS
 *     and must stay on a trusted server only.
 * ==========================================================================
 */
window.WELLNESSLAB_SUPABASE = {
  url: 'https://itdpbtrvkmwggeodsbzo.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZHBidHJ2a213Z2dlb2RzYnpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzM4MTksImV4cCI6MjEwNjYwOTgxOX0.euqlg1KBkYkXrwZZ_TKSagGkRQh1Jsz1dnko86JEr9M',
  table: 'bookings',

  // Local development origin used for Supabase OAuth redirects when a page is
  // opened over file:// (see js/auth.js). Keep the port in sync with server.js
  // / the `npm run dev` script, and add this URL under
  // Supabase -> Authentication -> URL Configuration -> Redirect URLs.
  localDevOrigin: 'http://localhost:3000'
};
