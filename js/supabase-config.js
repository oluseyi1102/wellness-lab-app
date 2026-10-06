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
  cartTable: 'cart',
  profileTable: 'profiles',

  // Local development origin used for Supabase OAuth redirects when a page is
  // opened over file:// (see js/auth.js). Keep the port in sync with server.js
  // / the `npm run dev` script, and add this URL under
  // Supabase -> Authentication -> URL Configuration -> Redirect URLs.
  localDevOrigin: 'http://localhost:3000'
};

/**
 * Shared Supabase client (singleton).
 * ---------------------------------------------------------------------------
 * Every page used to call `supabase.createClient()` on its own (auth.js,
 * cart.js and checkout.js each made one). Multiple GoTrueClient instances in
 * the same tab all try to consume the OAuth redirect (?code=... or
 * #access_token=...) AND the shared PKCE code verifier in localStorage - they
 * race each other, and the losing client ends up with NO session for the rest
 * of the page load even though the user really did sign in with Google.
 *
 * One shared client means one owner of the auth callback and one auth state
 * stream that every module can subscribe to.
 *
 * Returns null when the SDK or credentials are unavailable (callers fall back
 * to localStorage-only behaviour).
 */
window.WELLNESSLAB_SUPABASE.getClient = function getClient() {
  const cfg = window.WELLNESSLAB_SUPABASE;
  if (cfg._client) return cfg._client;
  if (typeof window.supabase === 'undefined' || !cfg.url || !cfg.anonKey) return null;
  cfg._client = window.supabase.createClient(cfg.url, cfg.anonKey);
  return cfg._client;
};
