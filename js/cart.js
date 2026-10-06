/**
 * ==========================================================================
 * WellnessLab Diagnostics - Persistent Shopping Cart
 * --------------------------------------------------------------------------
 * A single cart module shared by index.html and checkout.html.
 *
 *   • Signed-IN users: the cart is stored in the Supabase `cart` table
 *     (owner-scoped via RLS). Changes are pushed on every add/remove.
 *   • Signed-OUT (guest) users: the cart lives in localStorage.
 *   • On sign-in: the guest cart is merged into the account cart and the
 *     localStorage copy is cleared, so nothing is lost mid-checkout.
 *
 * Global API (window.WELLNESSLAB_CART):
 *   addItem({ id, type, name, price, image, meta })
 *   removeItem(id) / setQuantity(id, qty) / clear()
 *   getItems() / getCount() / open() / close() / refresh()
 *   ready (Promise) - resolves once the first session check has settled
 *
 * Boot order (important after the Google OAuth redirect):
 *   1. the API above is exported IMMEDIATELY (before any session work),
 *   2. the badge/drawer are painted from localStorage synchronously,
 *   3. the Supabase session is then awaited (auth events + getSession probes
 *      + a delayed re-probe) and the cart is rebuilt from the `cart` table.
 * ==========================================================================
 */
(function () {
  'use strict';

  const LS_KEY = 'wellnesslab_cart';
  const config = window.WELLNESSLAB_SUPABASE || {};
  const CART_TABLE = config.cartTable || 'cart';

  // ONE shared client per page (js/supabase-config.js getClient()).
  // Multiple clients race to consume the OAuth redirect after Google
  // sign-in, and the loser never sees the session - so the cart would never
  // rebuild. Falls back to a private client if the helper is missing.
  const supabaseClient =
    typeof config.getClient === 'function'
      ? config.getClient()
      : typeof window.supabase !== 'undefined' && config.url && config.anonKey
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;

  let items = readLocal(); // single source of truth for the UI

  // Resolves once the cart has completed its first auth settle (session found
  // and rebuilt, or confirmed guest). Other scripts can await
  // window.WELLNESSLAB_CART.ready before assuming the account cart is loaded.
  let markReady = function () {};
  const readyPromise = new Promise((resolve) => { markReady = resolve; });

  // Expose the module BEFORE any boot work runs, so the inline
  // onclick="addTestToCart(...)" / addPackageToCart(...) handlers always find
  // it - even if Supabase is unconfigured or the session check throws.
  window.WELLNESSLAB_CART = {
    addItem,
    removeItem,
    setQuantity,
    clear,
    getItems,
    getCount,
    open: openDrawer,
    close: closeDrawer,
    refresh: refreshUI,
    isSignedIn: () => currentUserId().then((uid) => Boolean(uid)).catch(() => false),
    ready: readyPromise
  };

  // -------------------------------------------------------------------------
  // Storage helpers
  // -------------------------------------------------------------------------
  function readLocal() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((i) => i && i.id) : [];
    } catch (err) {
      return [];
    }
  }

  function saveLocal() {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch (err) { /* storage full / unavailable - ignore */ }
  }

  // -------------------------------------------------------------------------
  // Auth + Supabase sync
  // -------------------------------------------------------------------------
  async function currentUserId() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data && data.session ? data.session.user.id : null;
  }

  /**
   * Read this user's cart rows from the `cart` table.
   * Returns `null` when the read FAILS (offline, RLS, table missing) so
   * callers can tell "the account cart is empty" apart from "we could not
   * load it" - an error must never be mistaken for an empty cart.
   */
  async function fetchDbCart(userId) {
    if (!supabaseClient) return null;
    try {
      const { data, error } = await supabaseClient
        .from(CART_TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[WellnessLab] Could not load cart from Supabase:', error.message);
        return null;
      }
      return (data || []).map((r) => ({
        id: r.item_id,
        type: r.item_type,
        name: r.name,
        price: r.price,
        image: r.image || '',
        meta: r.meta || '',
        quantity: r.quantity || 1
      }));
    } catch (err) {
      console.error('[WellnessLab] Could not load cart from Supabase:', err);
      return null;
    }
  }

  /**
   * Push the in-memory cart to the `cart` table.
   * Strategy: upsert current rows, delete rows that were removed, so the table
   * always mirrors the in-memory cart.
   * Resolves `true` only when every write succeeded, so callers know when it
   * is safe to drop the localStorage copy.
   */
  async function syncToSupabase() {
    if (!supabaseClient) return false;
    let synced = true;
    try {
      const userId = await currentUserId();
      if (!userId) return false; // guests stay in localStorage only

      // Rows currently in the DB for this user.
      let existing = [];
      try {
        const { data, error } = await supabaseClient
          .from(CART_TABLE)
          .select('item_id')
          .eq('user_id', userId);
        if (error) synced = false;
        existing = (data || []).map((r) => r.item_id);
      } catch (err) { synced = false; }

      const currentIds = items.map((i) => i.id);
      const removed = existing.filter((id) => !currentIds.includes(id));
      if (removed.length > 0) {
        const { error } = await supabaseClient
          .from(CART_TABLE)
          .delete()
          .eq('user_id', userId)
          .in('item_id', removed);
        if (error) {
          console.error('[WellnessLab] Cart delete failed:', error.message);
          synced = false;
        }
      }

      if (items.length > 0) {
        const payload = items.map((i) => ({
          user_id: userId,
          item_id: i.id,
          item_type: i.type,
          name: i.name,
          price: i.price,
          image: i.image || null,
          meta: i.meta || null,
          quantity: Math.max(1, i.quantity || 1)
        }));
        const { error } = await supabaseClient
          .from(CART_TABLE)
          .upsert(payload, { onConflict: 'user_id,item_id' });
        if (error) {
          console.error('[WellnessLab] Cart save failed:', error.message);
          synced = false;
        }
      }
    } catch (err) {
      console.error('[WellnessLab] Cart save failed:', err);
      synced = false;
    }
    return synced;
  }

  /** Merge two item lists keyed by id; `preferred` wins on conflicts. */
  function mergeArrays(base, preferred) {
    const map = new Map();
    (base || []).forEach((i) => map.set(i.id, Object.assign({}, i)));
    (preferred || []).forEach((i) => map.set(i.id, Object.assign({}, i)));
    return Array.from(map.values());
  }

  // -------------------------------------------------------------------------
  // Account (signed-in) cart rebuild - serialised
  // -------------------------------------------------------------------------
  // After an OAuth redirect several signals can arrive for the SAME sign-in
  // (INITIAL_SESSION event, the getSession() probe, SIGNED_IN). Running the
  // rebuild twice in parallel would race the merge/clear, so overlapping
  // requests coalesce into one follow-up run instead.
  let syncInFlight = null;
  let syncQueued = false;
  let retryTimer = null;

  function scheduleSyncRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      syncFromAccount();
    }, 4000);
  }

  function syncFromAccount() {
    if (syncInFlight) {
      syncQueued = true;
      return syncInFlight;
    }
    syncInFlight = runAccountSync()
      .catch((err) => {
        console.error('[WellnessLab] Cart sync failed:', err);
        refreshUI();
        markReady();
        scheduleSyncRetry();
      })
      .finally(() => {
        syncInFlight = null;
        if (syncQueued) {
          syncQueued = false;
          syncFromAccount();
        }
      });
    return syncInFlight;
  }

  async function runAccountSync() {
    const uid = await currentUserId();
    if (!uid) {
      refreshUI(); // signed out again in the meantime - guest state
      markReady();
      return;
    }

    const dbItems = await fetchDbCart(uid);
    const localItems = readLocal();

    if (dbItems === null) {
      // The READ failed (offline / RLS / table missing). Keep the cart that is
      // already on screen and KEEP localStorage - never treat a failed read as
      // "the account cart is empty" and wipe a real cart. Retry shortly.
      refreshUI();
      markReady();
      scheduleSyncRetry();
      return;
    }

    // DB cart is the baseline; any guest (localStorage) items are promoted on
    // top so nothing added while signed-out is lost.
    items = mergeArrays(dbItems, localItems).filter((i) => i.quantity > 0);

    const synced = await syncToSupabase();
    if (synced) {
      // Only drop the local copy once the account cart definitely has it.
      try { window.localStorage.removeItem(LS_KEY); } catch (err) { /* ignore */ }
    } else {
      // Save failed: keep a local backup of the merged cart instead.
      saveLocal();
    }
    refreshUI();
    markReady();
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  function addItem(item) {
    if (!item || !item.id) return;
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      items.push(Object.assign({ quantity: 1 }, item));
    }
    persist();
    refreshUI();
    toast(`Added ${item.name} to your cart`);
  }

  function removeItem(id) {
    items = items.filter((i) => i.id !== id);
    persist();
    refreshUI();
    toast('Removed from your cart');
  }

  function setQuantity(id, qty) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    it.quantity = Math.max(1, Math.min(99, Number(qty) || 1));
    persist();
    refreshUI();
  }

  function clear() {
    items = [];
    persist();
    refreshUI();
    toast('Your cart has been cleared');
  }

  function getItems() { return items.slice(); }
  function getCount() {
    return items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  }

  /** Save locally + push to Supabase (fire-and-forget when signed-in). */
  function persist() {
    saveLocal();
    syncToSupabase();
  }

  // -------------------------------------------------------------------------
  // UI rendering
  // -------------------------------------------------------------------------
  function naira(amount) {
    return `₦${Number(amount || 0).toLocaleString('en-US')}`;
  }

  function refreshUI() {
    items = items.filter((i) => (i.quantity || 1) > 0);

    // Badge on the cart button.
    const count = getCount();
    const badge = document.getElementById('cartCount');
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
    }

    // Drawer body.
    const listEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const emptyEl = document.getElementById('cartEmpty');

    if (listEl) {
      if (items.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        listEl.innerHTML = items.map((it) => {
          const checkoutHref = it.type === 'package'
            ? `checkout.html?pkg=${encodeURIComponent(it.id)}`
            : `checkout.html?test=${encodeURIComponent(it.id)}`;
          return `
            <li class="cart-line-item">
              <div class="cart-line-thumb">
                <img src="${it.image || ''}" alt="" loading="lazy"
                  onerror="this.style.display='none';">
              </div>
              <div class="cart-line-info">
                <span class="cart-line-name">${it.name}</span>
                <span class="cart-line-meta">${it.meta || it.type}</span>
                <div class="cart-line-bottom">
                  <span class="cart-line-price">${naira(it.price)}</span>
                  <div class="cart-line-qty">
                    <button type="button" data-inc="${it.id}" aria-label="Increase quantity">+</button>
                    <span>${it.quantity}</span>
                    <button type="button" data-dec="${it.id}" aria-label="Decrease quantity">−</button>
                  </div>
                </div>
              </div>
              <div class="cart-line-actions">
                <a href="${checkoutHref}" class="cart-line-book">Book</a>
                <button type="button" data-remove="${it.id}" class="cart-line-remove" aria-label="Remove ${it.name}">&times;</button>
              </div>
            </li>`;
        }).join('');
      }
    }

    if (totalEl) {
      totalEl.textContent = naira(
        items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
      );
    }

    // Gentle reminder when signed out (guests can still use the cart).
    const signInNote = document.getElementById('cartSignInNote');
    if (signInNote) {
      currentUserId()
        .then((uid) => {
          signInNote.style.display = uid ? 'none' : 'flex';
        })
        .catch(() => {
          signInNote.style.display = 'flex'; // session unreadable -> treat as guest
        });
    }
  }

  function toast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.25s ease';
      setTimeout(() => el.remove(), 250);
    }, 3000);
  }

  // -------------------------------------------------------------------------
  // Drawer open / close
  // -------------------------------------------------------------------------
  function openDrawer() {
    document.body.classList.add('cart-open');
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.add('is-open');
    refreshUI();
  }

  function closeDrawer() {
    document.body.classList.remove('cart-open');
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.remove('is-open');
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  function bindUI() {
    const toggle = document.getElementById('cartToggle');
    const closeBtn = document.getElementById('cartClose');
    const backdrop = document.getElementById('cartBackdrop');
    const clearBtn = document.getElementById('cartClearBtn');
    const listEl = document.getElementById('cartItems');

    if (toggle) toggle.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
    if (clearBtn) clearBtn.addEventListener('click', clear);

    // Delegate clicks inside the drawer list (remove / qty).
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.hasAttribute('data-remove')) {
          removeItem(btn.getAttribute('data-remove'));
        } else if (btn.hasAttribute('data-inc')) {
          const it = items.find((i) => i.id === btn.getAttribute('data-inc'));
          if (it) setQuantity(it.id, (it.quantity || 1) + 1);
        } else if (btn.hasAttribute('data-dec')) {
          const it = items.find((i) => i.id === btn.getAttribute('data-dec'));
          if (it) setQuantity(it.id, (it.quantity || 1) - 1);
        }
      });
    }

    // Close on Escape.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  /**
   * Probe the session once. `getSession()` waits for the client's init work -
   * including consuming the OAuth redirect (?code= / #access_token=) that
   * Google sent back - so a resolved user id here IS the signed-in session.
   */
  function probeSession() {
    currentUserId()
      .then((uid) => {
        if (uid) return syncFromAccount(); // rebuild badge + drawer from DB
        refreshUI(); // confirmed guest for now
        markReady();
        return undefined;
      })
      .catch((err) => {
        console.error('[WellnessLab] Could not read the Supabase session:', err);
        refreshUI();
        markReady();
      });
  }

  function init() {
    // 1) Wire the UI and paint from localStorage IMMEDIATELY - the badge and
    //    drawer must never wait on the network (or on the OAuth session) to
    //    appear after a page reload.
    bindUI();
    refreshUI();

    if (!supabaseClient) {
      console.warn('[WellnessLab] Supabase client not configured - cart will only use localStorage.');
      markReady();
      return;
    }

    // 2) Subscribe BEFORE probing the session, so auth events fired while the
    //    client restores the session from the OAuth redirect URL are never
    //    missed (INITIAL_SESSION / SIGNED_IN can arrive at any moment).
    supabaseClient.auth.onAuthStateChange((event, session) => {
      try {
        if (event === 'SIGNED_OUT') {
          saveLocal();
          refreshUI();
          markReady();
        } else if (session && session.user) {
          // Session became available (OAuth redirect, token refresh, ...):
          // rebuild the account cart and repaint badge + drawer.
          syncFromAccount();
        } else if (event === 'INITIAL_SESSION') {
          // Initial probe finished with no session -> guest state.
          refreshUI();
          markReady();
        }
      } catch (err) {
        console.error('[WellnessLab] Auth state handler failed:', err);
        refreshUI();
        markReady();
      }
    });

    // 3) Direct probe: covers the case where the session was restored before
    //    the subscription above existed.
    probeSession();

    // 4) Safety nets: the ?code= exchange can still be in flight when (3)
    //    runs, so probe once more shortly after; whatever happens, the UI is
    //    always settled a moment later.
    setTimeout(probeSession, 1500);
    setTimeout(() => { refreshUI(); markReady(); }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();