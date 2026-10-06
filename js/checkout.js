/**
 * WellnessLab Diagnostics - Checkout Page Logic
 * Resolves the selected test/package from the URL, renders the booking
 * summary and totals, then confirms the booking on-screen (no payment).
 */
document.addEventListener('DOMContentLoaded', () => {
  const HOME_COLLECTION_FEE = 5000;
  const FALLBACK_IMG = 'https://placehold.co/600x340/e0f2fe/0f766e?text=WellnessLab+Lab+Test';
  const WHATSAPP_NUMBER = '2348145389549';

  // Formats an amount as Nigerian Naira, e.g. 15000 -> ₦15,000
  const naira = (amount) => `₦${Number(amount).toLocaleString('en-US')}`;

  // DOM Elements
  const pageHeading = document.querySelector('.page-heading');
  const checkoutContent = document.getElementById('checkoutContent');
  const checkoutEmptyState = document.getElementById('checkoutEmptyState');
  const bookingSuccessView = document.getElementById('bookingSuccessView');
  const summaryItems = document.getElementById('summaryItems');
  const summaryCount = document.getElementById('summaryCount');
  const addonSelect = document.getElementById('addonSelect');
  const calcSubtotal = document.getElementById('calcSubtotal');
  const calcServiceRow = document.getElementById('calcServiceRow');
  const calcServiceFee = document.getElementById('calcServiceFee');
  const calcTotal = document.getElementById('calcTotal');
  const checkoutForm = document.getElementById('checkoutForm');
  const patientNameInput = document.getElementById('patientName');
  const patientPhoneInput = document.getElementById('patientPhone');
  const preferredDateInput = document.getElementById('preferredDate');
  const homeAddressInput = document.getElementById('homeAddress');
  const homeAddressLabel = document.querySelector('label[for="homeAddress"]');
  const serviceInputs = document.querySelectorAll('input[name="serviceType"]');

  // ---------------------------------------------------------------------------
  // Resolve the selected items from the URL (?test=id / ?pkg=id &addons=a,b)
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const testId = params.get('test');
  const pkgId = params.get('pkg');

  let primaryItem = null;
  let addons = [];
  let serviceType = params.get('service') === 'lab' ? 'lab' : 'home';

  if (testId) {
    const test = MEDICAL_TESTS.find(t => t.id === testId);
    if (test) {
      primaryItem = {
        id: test.id,
        name: test.name,
        price: test.price,
        image: test.image,
        meta: `${test.turnaround} • ${test.sampleType}`
      };
    }
  } else if (pkgId) {
    const pkg = PACKAGES.find(p => p.id === pkgId);
    if (pkg) {
      primaryItem = {
        id: pkg.id,
        name: pkg.title,
        price: pkg.price,
        image: pkg.image,
        meta: `${pkg.testsIncluded.length} tests included • ${pkg.turnaround}`
      };
    }
  }

  // Optional add-ons carried over from the landing page
  (params.get('addons') || '').split(',').filter(Boolean).forEach(id => {
    const test = MEDICAL_TESTS.find(t => t.id === id);
    if (test && primaryItem && test.id !== primaryItem.id && !addons.some(a => a.id === test.id)) {
      addons.push({
        id: test.id,
        name: test.name,
        price: test.price,
        image: test.image,
        meta: `${test.turnaround} • ${test.sampleType}`
      });
    }
  });

  // Nothing selected -> show the empty state instead of the checkout
  if (!primaryItem) {
    if (pageHeading) pageHeading.style.display = 'none';
    if (checkoutContent) checkoutContent.style.display = 'none';
    if (checkoutEmptyState) checkoutEmptyState.style.display = 'block';
    return;
  }

  // ---------------------------------------------------------------------------
  // Preferred date: minimum & default = tomorrow
  // ---------------------------------------------------------------------------
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${yyyy}-${mm}-${dd}`;

  if (preferredDateInput) {
    preferredDateInput.min = tomorrowStr;
    preferredDateInput.value = tomorrowStr;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const getAllItems = () => [primaryItem, ...addons];

  const getTotals = () => {
    const subtotal = getAllItems().reduce((sum, item) => sum + item.price, 0);
    const fee = serviceType === 'home' ? HOME_COLLECTION_FEE : 0;
    return { subtotal, fee, total: subtotal + fee };
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

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

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderSummary() {
    const items = getAllItems();

    summaryCount.textContent = `${items.length} ${items.length === 1 ? 'Test' : 'Tests'}`;

    summaryItems.innerHTML = items.map((item, index) => `
      <li class="summary-item${index === 0 ? ' is-primary' : ''}">
        <div class="summary-item-thumb">
          <img src="${item.image || FALLBACK_IMG}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='${FALLBACK_IMG}';">
        </div>
        <div class="summary-item-info">
          <span class="summary-item-name">${item.name}</span>
          <span class="summary-item-meta">${item.meta || ''}</span>
        </div>
        <div class="summary-item-right">
          <span class="summary-item-price">${naira(item.price)}</span>
          ${index === 0
            ? '<span class="summary-item-chip">Selected</span>'
            : `<button type="button" class="summary-item-remove" data-remove="${item.id}" aria-label="Remove ${item.name}">&times;</button>`}
        </div>
      </li>
    `).join('');

    renderAddonOptions();
    renderTotals();
  }

  function renderAddonOptions() {
    const chosenIds = getAllItems().map(item => item.id);
    const options = MEDICAL_TESTS.filter(t => !chosenIds.includes(t.id));

    addonSelect.innerHTML =
      '<option value="">-- Add another test to your booking --</option>' +
      options.map(t => `<option value="${t.id}">${t.name} (+${naira(t.price)})</option>`).join('');
  }

  function renderTotals() {
    const { subtotal, fee, total } = getTotals();

    calcSubtotal.textContent = naira(subtotal);
    calcServiceRow.style.display = 'flex';
    calcServiceFee.textContent = fee > 0 ? `+${naira(fee)}` : 'Free';
    calcTotal.textContent = naira(total);
  }

  function applyServiceType() {
    const radio = document.querySelector(`input[name="serviceType"][value="${serviceType}"]`);
    if (radio) radio.checked = true;

    if (serviceType === 'home') {
      homeAddressInput.required = true;
      if (homeAddressLabel) homeAddressLabel.textContent = 'Home Address *';
    } else {
      homeAddressInput.required = false;
      if (homeAddressLabel) homeAddressLabel.textContent = 'Home Address (optional for walk-in)';
    }

    renderTotals();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  // Add another test
  if (addonSelect) {
    addonSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      if (!selectedId) return;

      const test = MEDICAL_TESTS.find(t => t.id === selectedId);
      if (!test) return;

      addons.push({
        id: test.id,
        name: test.name,
        price: test.price,
        image: test.image,
        meta: `${test.turnaround} • ${test.sampleType}`
      });

      renderSummary();
      showToast(`Added ${test.name} to your booking`);
    });
  }

  // Remove an add-on (event delegation on the summary list)
  if (summaryItems) {
    summaryItems.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove]');
      if (!removeBtn) return;

      const idToRemove = removeBtn.getAttribute('data-remove');
      const removed = addons.find(a => a.id === idToRemove);
      addons = addons.filter(a => a.id !== idToRemove);

      renderSummary();
      if (removed) showToast(`Removed ${removed.name} from your booking`);
    });
  }

  // Collection method toggle
  serviceInputs.forEach(radio => {
    radio.addEventListener('change', (e) => {
      serviceType = e.target.value;
      applyServiceType();
    });
  });

  // Apply the initial collection method (supports ?service=home|lab)
  applyServiceType();
  renderSummary();

  // ---------------------------------------------------------------------------
  // Supabase client (credentials come from js/supabase-config.js, mirroring .env)
  // ---------------------------------------------------------------------------
  const supabaseConfig = window.WELLNESSLAB_SUPABASE || {};
  // Shared singleton client (see js/supabase-config.js) - one client per page
  // so auth.js / cart.js / checkout.js don't race over the OAuth callback.
  const supabaseClient = typeof supabaseConfig.getClient === 'function'
    ? supabaseConfig.getClient()
    : ((typeof window.supabase !== 'undefined' && supabaseConfig.url && supabaseConfig.anonKey)
        ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
        : null);

  // The id of the signed-in user, or null for guests. Sent as `user_id` on
  // the insert so the RLS policy on `bookings` can check the row belongs to
  // the person submitting it (see sql/create-bookings-table.sql).
  async function getSessionUserId() {
    if (!supabaseClient) return null;
    try {
      const { data } = await supabaseClient.auth.getSession();
      return data && data.session && data.session.user ? data.session.user.id : null;
    } catch (err) {
      console.error('[WellnessLab] Could not read session for booking:', err);
      return null;
    }
  }

  // Inserts one booking row into the `bookings` table.
  // Returns { ok: boolean, error: string|null } so the UI can react safely.
  async function saveBookingToSupabase(payload) {
    if (!supabaseClient) {
      return { ok: false, error: 'Supabase client is not configured (check js/supabase-config.js).' };
    }

    const { error } = await supabaseClient
      .from(supabaseConfig.table || 'bookings')
      .insert(payload);

    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  }

  // ---------------------------------------------------------------------------
  // Confirm Booking -> persist to Supabase, then show the success screen
  // ---------------------------------------------------------------------------
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!checkoutForm.reportValidity()) return;

      const patientName = patientNameInput.value.trim();
      const phone = patientPhoneInput.value.trim();
      const address = homeAddressInput.value.trim();
      const dateVal = preferredDateInput.value;
      const items = getAllItems();
      const { total } = getTotals();

      const bookingRef = 'LAB-' + Math.floor(100000 + Math.random() * 900000);
      const serviceLabel = serviceType === 'home' ? 'Home Sample Collection' : 'Walk-In Lab Visit';
      const addressLabel = serviceType === 'home'
        ? (address || '—')
        : 'WellnessLab Clinical Center (Walk-in)';
      const testsList = items.map(item => item.name).join(', ');

      // -----------------------------------------------------------------------
      // Persist the booking to Supabase BEFORE showing the confirmation screen.
      // -----------------------------------------------------------------------
      const confirmBtn = document.getElementById('confirmBookingBtn');
      const confirmBtnHtml = confirmBtn ? confirmBtn.innerHTML : null;

      const setSaving = (isSaving) => {
        if (!confirmBtn) return;
        confirmBtn.disabled = isSaving;
        confirmBtn.style.opacity = isSaving ? '0.75' : '';
        if (isSaving) {
          confirmBtn.innerHTML = 'Saving your booking…';
        } else if (confirmBtnHtml !== null) {
          confirmBtn.innerHTML = confirmBtnHtml;
        }
      };

      setSaving(true);

      // Attribute the booking to the signed-in user (null for guests) so the
      // `bookings` RLS insert policy can verify ownership. Without this the
      // insert fails with 42501 for authenticated users.
      const userId = await getSessionUserId();

      const { ok, error } = await saveBookingToSupabase({
        user_id: userId,
        patient_name: patientName,
        phone_number: phone,
        address: serviceType === 'home' ? address : 'WellnessLab Clinical Center (Walk-in)',
        preferred_date: dateVal || null,
        test_booked: testsList
      });

      setSaving(false);

      if (!ok) {
        console.error('[WellnessLab] Supabase booking insert failed:', error);
        showToast('Could not save your booking. Please check your internet connection and try again.');
        return;
      }

      // Populate the confirmation ticket
      document.getElementById('ticketRef').textContent = bookingRef;
      document.getElementById('ticketPatient').textContent = patientName;
      document.getElementById('ticketPhone').textContent = phone;
      document.getElementById('ticketDate').textContent = formatDate(dateVal);
      document.getElementById('ticketService').textContent = serviceLabel;
      document.getElementById('ticketAddress').textContent = addressLabel;
      document.getElementById('ticketTests').textContent = testsList;
      document.getElementById('ticketTotal').textContent = naira(total);

      // Pre-filled WhatsApp confirmation to the laboratory
      const msgText = encodeURIComponent(
        `Hello WellnessLab Diagnostics,\n\nI have submitted a test booking:\n` +
        `• Booking Reference: ${bookingRef}\n` +
        `• Patient: ${patientName}\n` +
        `• Phone: ${phone}\n` +
        `• Test(s): ${testsList}\n` +
        `• Preferred Date: ${formatDate(dateVal)}\n` +
        `• Collection: ${serviceLabel}${serviceType === 'home' ? ` (${addressLabel})` : ''}\n` +
        `• Total Due on Collection: ${naira(total)}\n\n` +
        `Please confirm my sample collection appointment.`
      );
      const whatsappBtn = document.getElementById('whatsappConfirmBtn');
      if (whatsappBtn) whatsappBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msgText}`;

      // Swap the checkout for the on-screen confirmation
      if (pageHeading) pageHeading.style.display = 'none';
      if (checkoutContent) checkoutContent.style.display = 'none';
      bookingSuccessView.style.display = 'block';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});
