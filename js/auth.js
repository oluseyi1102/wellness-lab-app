/**
 * ==========================================================================
 * WellnessLab Diagnostics - Google OAuth Authentication
 * --------------------------------------------------------------------------
 * Powers the "Sign in with Google" button on the landing page using the
 * Supabase JS client (loaded from the CDN in index.html) together with the
 * credentials defined in js/supabase-config.js.
 *
 * Supabase setup notes:
 *   - Authentication -> Providers -> Google : must be ENABLED
 *   - Authentication -> URL Configuration   : this page's origin must be an
 *     allowed "Redirect URL" (e.g. http://localhost:5500/** in development).
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  const signInBtn = document.getElementById('googleSignInBtn');
  const signInLabel = document.getElementById('googleSignInLabel');

  // The button only exists on pages that opt in to it (index.html).
  if (!signInBtn) return;

  const SIGNED_OUT_TEXT = 'Sign in with Google';

  // -------------------------------------------------------------------------
  // Supabase client (credentials come from js/supabase-config.js, mirroring .env)
  // -------------------------------------------------------------------------
  const config = window.WELLNESSLAB_SUPABASE || {};
  const supabaseClient = (typeof window.supabase !== 'undefined' && config.url && config.anonKey)
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  // Opening the site straight from disk (file://) breaks OAuth.
  if (window.location.protocol === 'file:') {
    console.warn(
      '[WellnessLab] This page was opened over file:// - Google sign-in needs the local dev server.\n' +
      'Run "npm run dev" and open http://localhost:3000/index.html'
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // Prefer the Google profile name, fall back to the email address.
  function displayName(user) {
    if (!user) return '';
    const meta = user.user_metadata || {};
    return meta.full_name || meta.name || user.email || 'Signed in';
  }

  function setButtonLabel(text) {
    if (signInLabel) signInLabel.textContent = text;
  }

  // -------------------------------------------------------------------------
  // Redirect target
  // -------------------------------------------------------------------------
  // OAuth needs a real http(s) origin. A page opened from disk (file://)
  // reports its origin as "null", so those users are sent to the local dev
  // server instead (start it with `npm run dev`).
  const LOCAL_DEV_ORIGIN = config.localDevOrigin || 'http://localhost:3000';

  function resolveRedirectTo() {
    const loc = window.location;
    const isFile = loc.protocol === 'file:' || !loc.origin || loc.origin === 'null';

    if (isFile) return `${LOCAL_DEV_ORIGIN}/index.html`;

    // Treat a bare "/" as /index.html so the URL matches the
    // "<origin>/**" redirect pattern allow-listed in Supabase.
    const page = loc.pathname === '/' ? '/index.html' : loc.pathname;
    return loc.origin + page;
  }

  function renderSignedIn(user) {
    const name = displayName(user);
    signInBtn.classList.add('is-signed-in');
    signInBtn.disabled = false;
    setButtonLabel(name);
    signInBtn.setAttribute('aria-label', `Signed in as ${name}. Click to sign out.`);
    signInBtn.setAttribute('title', `Signed in as ${name} - click to sign out`);
  }

  function renderSignedOut() {
    signInBtn.classList.remove('is-signed-in');
    signInBtn.disabled = false;
    setButtonLabel(SIGNED_OUT_TEXT);
    signInBtn.setAttribute('aria-label', SIGNED_OUT_TEXT);
    signInBtn.removeAttribute('title');
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  async function signInWithGoogle() {
    setButtonLabel('Redirecting to Google...');
    signInBtn.disabled = true;

    // Send the user straight back to this page (localhost:3000 in dev).
    const redirectTo = resolveRedirectTo();

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });

    if (error) {
      console.error('[WellnessLab] Google sign-in failed:', error);
      showToast('Could not start Google sign-in. Please try again.');
      renderSignedOut();
      return;
    }
    // On success the browser navigates to Google, so nothing else to do here.
  }

  async function signOut() {
    signInBtn.disabled = true;
    setButtonLabel('Signing out...');

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error('[WellnessLab] Sign-out failed:', error);
      showToast('Could not sign out. Please try again.');
    } else {
      showToast('You have been signed out.');
    }
    renderSignedOut();
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  signInBtn.addEventListener('click', async () => {
    if (!supabaseClient) {
      showToast('Sign-in is unavailable right now. Please try again later.');
      return;
    }

    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      await signOut();
    } else {
      await signInWithGoogle();
    }
  });

  // -------------------------------------------------------------------------
  // Initial state + keep the button in sync (this also handles the redirect
  // back from Google, where Supabase restores the session from the URL).
  // -------------------------------------------------------------------------
  (async () => {
    if (!supabaseClient) {
      signInBtn.disabled = true;
      signInBtn.setAttribute('title', 'Sign-in is not configured');
      console.error('[WellnessLab] Supabase client not configured (check js/supabase-config.js).');
      return;
    }

    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      renderSignedIn(data.session.user);
    } else {
      renderSignedOut();
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        renderSignedIn(session.user);
      } else {
        renderSignedOut();
      }
    });
  })();
});
