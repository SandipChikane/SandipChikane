const modal = document.getElementById('dashboardModal');
const modalContent = document.getElementById('dashboardModalContent');
const modalClose = document.getElementById('dashboardModalClose');
const toast = document.getElementById('dashToast');
const studentName = document.getElementById('studentFirstName');

function applyStudentIdentity(email) {
  const savedEmail = (email || window.GradflowEnrollment.getStudentEmail() || '').trim();
  if (!savedEmail) return;
  const first = savedEmail.split('@')[0].split(/[._-]/)[0];
  if (first && studentName) {
    studentName.textContent = first.charAt(0).toUpperCase() + first.slice(1) + '.';
  }
  const chip = document.getElementById('studentChipName');
  if (chip) chip.textContent = savedEmail;
  const avatar = document.getElementById('studentAvatar');
  if (avatar) avatar.textContent = (first || savedEmail).slice(0, 2).toUpperCase();
}

applyStudentIdentity();

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(window.dashToastTimer);
  window.dashToastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function openModal(content) {
  modalContent.innerHTML = content;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.getElementById('helpButton').addEventListener('click', () => openModal(`<p class="mini-eyebrow">HELP CENTRE</p><h2>Let’s get you<br /><em>unstuck.</em></h2><p>Tell us what you’re working through and we’ll point you to the right lesson, resource or mentor support.</p><button class="button button-dark" id="helpStart">Explore support <span>→</span></button>`));
document.addEventListener('click', (event) => {
  if (event.target.id === 'helpStart') { closeModal(); showToast('Your space is ready.', 'This action will connect to your live account in production.'); }
  if (event.target === modal || event.target === modalClose) closeModal();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

const dashMenu = document.getElementById('dashMenu');
const sidebar = document.querySelector('.dash-sidebar');
dashMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.dash-nav a').forEach((link) => link.addEventListener('click', () => sidebar.classList.remove('open')));

function setAuthForms({ session, hasAccount, email }) {
  const signIn = document.getElementById('dashSignInForm');
  const setPassword = document.getElementById('dashSetPasswordForm');
  if (signIn) signIn.hidden = Boolean(session);
  if (setPassword) {
    setPassword.hidden = !session || hasAccount;
    const copy = document.getElementById('dashSetPasswordCopy');
    if (copy) {
      copy.textContent = hasAccount
        ? 'Change the password for this email. You will use it on other devices.'
        : 'You are signed in on this browser. Set a password so you can come back later.';
    }
    const current = document.getElementById('dashCurrentPassword');
    if (current) current.required = Boolean(hasAccount);
  }
  if (email) {
    applyStudentIdentity(email);
    const dashEmail = document.getElementById('dashEmail');
    if (dashEmail && !dashEmail.value) dashEmail.value = email;
  }
}

document.getElementById('dashSignInForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('dashEmail').value.trim();
  const password = document.getElementById('dashPassword').value;
  const button = event.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await window.GradflowEnrollment.studentLogin({ email, password });
    if (!result.ok) throw new Error(result.data.error || 'Could not sign in.');
    applyStudentIdentity(result.data.email || email);
    showToast('Signed in.', 'Your referral page is ready.');
    await syncReferralPage();
  } catch (error) {
    showToast('Could not sign in.', error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

document.getElementById('dashSetPasswordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('dashNewPassword').value;
  const confirm = document.getElementById('dashNewPasswordConfirm').value;
  const currentPassword = document.getElementById('dashCurrentPassword').value;
  if (password !== confirm) {
    showToast('Passwords do not match.', 'Use the same password in both fields.');
    return;
  }
  const button = event.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await window.GradflowEnrollment.setStudentPassword({ password, currentPassword });
    if (!result.ok) throw new Error(result.data.error || 'Could not save the password.');
    document.getElementById('dashNewPassword').value = '';
    document.getElementById('dashNewPasswordConfirm').value = '';
    document.getElementById('dashCurrentPassword').value = '';
    showToast('Password saved.', 'Use this email and password to sign in on any device.');
    await syncReferralPage();
  } catch (error) {
    showToast('Password not saved.', error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

document.getElementById('studentLogout')?.addEventListener('click', async () => {
  try {
    await window.GradflowEnrollment.studentLogout();
  } finally {
    window.GradflowEnrollment.goToLanding();
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function moneyPaise(paise) {
  const amount = Number(paise) || 0;
  const rupees = Math.trunc(amount / 100);
  const rem = Math.abs(amount % 100);
  const formatted = rupees.toLocaleString('en-IN');
  return rem ? `₹${formatted}.${String(rem).padStart(2, '0')}` : `₹${formatted}`;
}

function statusLabel(status) {
  const map = {
    PENDING: 'Pending',
    AVAILABLE: 'Available',
    PAID: 'Paid',
    REVERSED: 'Reversed',
    WITHDRAWAL_PENDING: 'Pending',
    REJECTED: 'Reversed',
  };
  return map[String(status || '').toUpperCase()] || String(status || '');
}

function statusClass(status) {
  const key = String(status || '').toUpperCase();
  if (key === 'AVAILABLE') return 'available';
  if (key === 'PAID') return 'paid';
  if (key === 'REVERSED' || key === 'REJECTED') return 'reversed';
  return 'pending';
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN');
}

function methodOptions(methods, selected) {
  return (methods || ['UPI', 'BANK']).map((method) => (
    `<option value="${escapeHtml(method)}" ${selected === method ? 'selected' : ''}>${escapeHtml(method)}</option>`
  )).join('');
}

async function syncReferralPage() {
  const refresh = await window.GradflowEnrollment.refreshFromServer();
  setAuthForms({
    session: Boolean(refresh.session),
    hasAccount: Boolean(refresh.hasAccount),
    email: refresh.email || window.GradflowEnrollment.getStudentEmail(),
  });
  await renderReferralPage(Boolean(refresh.session));
}

async function renderReferralPage(signedIn) {
  const root = document.getElementById('referralRoot');
  const headline = document.getElementById('referralHeadline');
  if (!root) return;
  if (!signedIn) {
    if (headline) headline.textContent = 'Sign in to open your referral link, earnings and withdrawals.';
    root.innerHTML = '<p class="dash-locked-note" id="referralEmpty">Sign in to see your referral link and earnings.</p>';
    return;
  }
  const result = await window.GradflowEnrollment.referralDashboard();
  if (!result.ok) {
    root.innerHTML = '<p class="dash-locked-note">Referral earnings will appear here after the program is configured.</p>';
    return;
  }
  const data = result.data;
  if (headline && data.disclosure) headline.textContent = data.disclosure;
  if (!data.enabled) {
    root.innerHTML = '<p class="dash-locked-note">The referral program is not enabled yet.</p>';
    return;
  }

  const rateLabel = data.commissionRateLabel || '';
  const eligibility = data.eligibility || {};
  const unlocked = Boolean(eligibility.eligible);
  const remainingCopy = !eligibility.thresholdPaise
    ? 'Withdrawals unlock after you purchase a course. The threshold is the amount you actually paid, not the current catalog price.'
    : unlocked
      ? 'Withdrawal eligible. Available referral earnings have reached your qualifying course-purchase threshold.'
      : `${moneyPaise(eligibility.remainingPaise)} more in available referral earnings required.`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Use my Gradflow referral link when you enroll: ${data.link}`)}`;

  root.innerHTML = `
    <section class="course-access-block" id="referralLink">
      <div class="section-title-row">
        <div>
          <p class="mini-eyebrow">REFERRAL LINK</p>
          <h2>Earn <em>${escapeHtml(rateLabel)}</em> on every eligible successful direct referral purchase.</h2>
        </div>
      </div>
      <p class="dash-locked-note" id="referralDisclosure">${escapeHtml(data.disclosure || '')}</p>
      <article class="today-card referral-card">
        <div class="today-title"><div><p class="mini-eyebrow">YOUR UNIQUE LINK</p><h3>${escapeHtml(data.code)}</h3></div></div>
        <p class="dash-locked-note" id="referralLinkValue">${escapeHtml(data.link)}</p>
        <div class="referral-actions">
          <button class="button button-dark button-sm" type="button" id="copyReferral">Copy link</button>
          <a class="button button-lime button-sm" id="whatsappReferral" href="${whatsapp}" target="_blank" rel="noreferrer">WhatsApp share</a>
          <button class="button button-dark button-sm" type="button" id="shareReferral">Share</button>
        </div>
      </article>
    </section>

    <section class="course-access-block" id="referralEarnings">
      <div class="section-title-row">
        <div>
          <p class="mini-eyebrow">EARNINGS SUMMARY</p>
          <h2>Your referral <em>balance.</em></h2>
        </div>
      </div>
      <div class="referral-stats">
        <span>Pending earnings <strong>${moneyPaise(data.balances?.pending)}</strong></span>
        <span>Available earnings <strong>${moneyPaise(data.balances?.available)}</strong></span>
        <span>Withdrawn earnings <strong>${moneyPaise(data.balances?.withdrawn ?? data.balances?.paid)}</strong></span>
        <span>Reversed earnings <strong>${moneyPaise(data.balances?.reversed)}</strong></span>
        <span>Total referral earnings <strong>${moneyPaise(data.balances?.total)}</strong></span>
      </div>
    </section>

    <section class="course-access-block" id="referralEligibility">
      <div class="section-title-row">
        <div>
          <p class="mini-eyebrow">WITHDRAWAL ELIGIBILITY</p>
          <h2>${unlocked ? 'Withdrawal <em>eligible.</em>' : 'Unlock <em>withdrawals.</em>'}</h2>
        </div>
      </div>
      <article class="today-card">
        <div class="referral-stats">
          <span>Available commission <strong>${moneyPaise(eligibility.availablePaise ?? data.balances?.available)}</strong></span>
          <span>Required withdrawal threshold <strong>${eligibility.thresholdPaise ? moneyPaise(eligibility.thresholdPaise) : 'Not set yet'}</strong></span>
          <span>Remaining until eligible <strong>${eligibility.thresholdPaise ? moneyPaise(eligibility.remainingPaise) : '—'}</strong></span>
        </div>
        <p class="dash-locked-note">${escapeHtml(remainingCopy)}</p>
      </article>
    </section>

    <div class="dash-grid referral-page-grid">
      <section class="course-access-block">
        <p class="mini-eyebrow">PAYOUT METHOD</p>
        <h2>Where we <em>send</em> withdrawals.</h2>
        <form class="dash-auth-card referral-payout" id="payoutForm">
          <label>Method
            <select name="method">${methodOptions(data.methods, data.payout?.method)}</select>
          </label>
          <label>UPI ID<input name="upiId" placeholder="name@upi" autocomplete="off"></label>
          <label>Account holder<input name="holderName" value="${escapeHtml(data.payout?.holderName || '')}"></label>
          <label>Bank name<input name="bankName" autocomplete="off"></label>
          <label>Account number<input name="accountNumber" autocomplete="off"></label>
          <label>IFSC<input name="ifsc" autocomplete="off"></label>
          <p class="dash-locked-note">${data.payout ? `Saved ${escapeHtml(data.payout.method)} ${escapeHtml(data.payout.upiId || data.payout.accountNumber || '')}` : 'Payout details are stored encrypted and shown masked.'}</p>
          <button class="button button-dark button-sm" type="submit">Save payout method</button>
        </form>
        ${data.withdrawalEnabled ? `
          <form class="dash-auth-card referral-payout" id="withdrawForm">
            <p class="mini-eyebrow">REQUEST WITHDRAWAL</p>
            <label>Amount (INR)<input name="amountRupees" required inputmode="decimal" ${unlocked ? '' : 'disabled'}></label>
            <label>Method
              <select name="method" ${unlocked ? '' : 'disabled'}>${methodOptions(data.methods, data.payout?.method)}</select>
            </label>
            <button class="button button-lime button-sm" type="submit" ${unlocked ? '' : 'disabled'}>Request withdrawal</button>
          </form>
        ` : '<p class="dash-locked-note">Withdrawals are not enabled yet.</p>'}
        ${data.acceptedTerms ? '' : '<button class="text-action" type="button" id="acceptReferralTerms">Accept referral terms</button>'}
      </section>

      <section class="course-access-block">
        <p class="mini-eyebrow">WITHDRAWAL HISTORY</p>
        <h2>Payout <em>status.</em></h2>
        <div class="referral-history">
          ${(data.withdrawals || []).map((row) => `
            <article class="dash-course-link">
              <span>
                <strong>${moneyPaise(row.amountPaise)}</strong>
                <small>${escapeHtml(row.method)} · ${escapeHtml(formatWhen(row.createdAt))}</small>
              </span>
              <span class="access-pill ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
            </article>
          `).join('') || '<p class="dash-locked-note">No withdrawal requests yet.</p>'}
        </div>
      </section>
    </div>

    <section class="course-access-block" id="referralActivity">
      <div class="section-title-row">
        <div>
          <p class="mini-eyebrow">REFERRAL ACTIVITY</p>
          <h2>Successful <em>direct</em> referrals.</h2>
        </div>
      </div>
      <div class="referral-history">
        ${(data.recent || []).map((row) => `
          <article class="dash-course-link">
            <span>
              <strong>${escapeHtml(row.referredMasked || row.referred || 'Referred student')}</strong>
              <small>${escapeHtml(row.courseId || '')} · Commission ${moneyPaise(row.amountPaise)}${row.paidPaise ? ` · Purchase ${moneyPaise(row.paidPaise)}` : ''} · ${escapeHtml(formatWhen(row.createdAt))}</small>
            </span>
            <span class="access-pill ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
          </article>
        `).join('') || '<p class="dash-locked-note">No successful referrals yet.</p>'}
      </div>
    </section>
  `;

  document.getElementById('copyReferral')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.link);
      showToast('Link copied.', 'Share it only with people you know.');
    } catch {
      showToast('Copy the link manually.', data.link);
    }
  });
  document.getElementById('shareReferral')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Gradflow referral', url: data.link, text: 'Use my Gradflow referral link when you enroll.' });
      } catch {
        /* user cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(data.link);
      showToast('Link copied.', 'Sharing is available on supported browsers.');
    } catch {
      showToast('Share this link.', data.link);
    }
  });
  document.getElementById('acceptReferralTerms')?.addEventListener('click', async () => {
    const saved = await window.GradflowEnrollment.acceptReferralTerms();
    if (!saved.ok) {
      showToast('Could not accept terms.', saved.data.error || 'Try again.');
      return;
    }
    showToast('Terms accepted.', 'Referral rewards still depend on eligible paid purchases.');
    renderReferralPage(true);
  });
  document.getElementById('payoutForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const saved = await window.GradflowEnrollment.savePayoutAccount({
      method: form.get('method'),
      upiId: form.get('upiId'),
      accountNumber: form.get('accountNumber'),
      ifsc: form.get('ifsc'),
      holderName: form.get('holderName'),
      bankName: form.get('bankName'),
    });
    if (!saved.ok) {
      showToast('Payout method not saved.', saved.data.error || 'Try again.');
      return;
    }
    showToast('Payout method saved.', 'Account numbers stay masked after save.');
    renderReferralPage(true);
  });
  document.getElementById('withdrawForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!unlocked) {
      showToast('Withdrawal locked.', remainingCopy);
      return;
    }
    const form = new FormData(event.target);
    const saved = await window.GradflowEnrollment.requestWithdrawal({
      amountRupees: form.get('amountRupees'),
      method: form.get('method'),
      idempotencyKey: `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (!saved.ok) {
      showToast('Withdrawal not submitted.', saved.data.error || 'Try again.');
      return;
    }
    showToast('Withdrawal requested.', 'Finance will review it before payout.');
    renderReferralPage(true);
  });
}

syncReferralPage();
