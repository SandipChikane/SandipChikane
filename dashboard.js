const modal = document.getElementById('dashboardModal');
const modalContent = document.getElementById('dashboardModalContent');
const modalClose = document.getElementById('dashboardModalClose');
const toast = document.getElementById('dashToast');
const studentName = document.getElementById('studentFirstName');
function primaryCourse() {
  return window.GradflowEnrollment.catalog.find((course) => window.GradflowEnrollment.isEnrolled(course.id))
    || window.GradflowEnrollment.catalog[0]
    || null;
}

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

function analyticsUnlocked() {
  const course = primaryCourse();
  return Boolean(course && window.GradflowEnrollment.isEnrolled(course.id));
}

function goToCourse(courseId) {
  if (!courseId) {
    window.location.href = 'index.html#courses';
    return;
  }
  window.location.href = window.GradflowEnrollment.courseUrl(courseId);
}

function requireAnalytics(openUnlocked) {
  const course = primaryCourse();
  if (!course || !window.GradflowEnrollment.isEnrolled(course.id)) {
    goToCourse(course?.id);
    return;
  }
  openUnlocked();
}

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

async function goContinue(courseId) {
  const targetId = courseId || primaryCourse()?.id;
  if (!targetId || !window.GradflowEnrollment.isEnrolled(targetId)) {
    goToCourse(targetId);
    return;
  }
  const detail = await window.GradflowEnrollment.loadStudentCourse(targetId);
  if (detail?.resume?.lessonId) {
    window.location.href = window.GradflowEnrollment.courseUrl(targetId, {
      section: detail.resume.sectionSlug,
      lesson: detail.resume.lessonId,
    });
    return;
  }
  goToCourse(targetId);
}

document.getElementById('continueButton').addEventListener('click', () => {
  const course = primaryCourse();
  if (!course || !window.GradflowEnrollment.isEnrolled(course.id)) {
    goToCourse(course?.id);
    return;
  }
  goContinue(course.id);
});
document.getElementById('resumeLesson').addEventListener('click', () => {
  const course = primaryCourse();
  if (!course || !window.GradflowEnrollment.isEnrolled(course.id)) {
    goToCourse(course?.id);
    return;
  }
  goContinue(course.id);
});

document.querySelectorAll('.task-list input').forEach((input) => {
  input.addEventListener('change', () => {
    const done = document.querySelectorAll('.task-list input:checked').length;
    document.getElementById('taskCount').textContent = `${done} of 3 done`;
    if (done === 3) showToast('Today’s focus is complete.', 'Nice work — your streak is still alive.');
  });
});

document.getElementById('clearTasks').addEventListener('click', () => {
  document.querySelectorAll('.task-list input:checked').forEach((input) => { input.checked = false; });
  document.getElementById('taskCount').textContent = '0 of 3 done';
  showToast('Completed tasks cleared.', 'Your focus list is ready for a fresh start.');
});

document.querySelectorAll('.open-project').forEach((button) => {
  button.addEventListener('click', () => {
    if (!analyticsUnlocked()) {
      goToCourse(primaryCourse()?.id);
      return;
    }
    const project = button.dataset.project;
    openModal(`<p class="mini-eyebrow">PROJECT WORKSPACE</p><h2>${project}<br /><em>is ready.</em></h2><p>Open your project brief, see the next milestone and add your work when you’re ready. Your feedback history will stay attached to this project.</p><button class="button button-dark" id="projectOpen">Open workspace <span>↗</span></button>`);
    document.getElementById('projectOpen').addEventListener('click', () => { closeModal(); showToast('Workspace opened.', `Welcome back to ${project}.`); });
  });
});

function newProject() {
  if (!analyticsUnlocked()) {
    goToCourse(primaryCourse()?.id);
    return;
  }
  openModal(`<p class="mini-eyebrow">GUIDED PROJECTS</p><h2>Choose your next<br /><em>challenge.</em></h2><p>Pick a real-world brief to add to your portfolio. Your mentor will help you focus it into a clear case study.</p><button class="button button-lime" id="browseBriefs">Browse project briefs <span>→</span></button>`);
  document.getElementById('browseBriefs').addEventListener('click', () => { closeModal(); showToast('Project briefs unlocked.', 'Three recommended briefs were added to your workspace.'); });
}
document.getElementById('newProject').addEventListener('click', newProject);
document.getElementById('projectStarter').addEventListener('click', newProject);

document.getElementById('messageMentor').addEventListener('click', () => openModal(`<p class="mini-eyebrow">MESSAGE MENTOR</p><h2>Ask Meera for<br /><em>feedback.</em></h2><p>Prototype preview: in production this would open a private mentor conversation for your enrolled course.</p><button class="button button-dark" id="messageSent">Start a conversation <span>→</span></button>`));
document.getElementById('profileButton').addEventListener('click', () => openModal(`<p class="mini-eyebrow">CAREER SPACE</p><h2>One detail can<br /><em>make it stick.</em></h2><p>Add a measurable outcome to your project: time saved, revenue found, conversion improved or a decision influenced.</p><button class="button button-lime" id="profileSaved">Edit my profile <span>→</span></button>`));
document.getElementById('calendarButton').addEventListener('click', () => showToast('Calendar opened.', 'Your next three course events are highlighted.'));
document.getElementById('helpButton').addEventListener('click', () => openModal(`<p class="mini-eyebrow">HELP CENTRE</p><h2>Let’s get you<br /><em>unstuck.</em></h2><p>Tell us what you’re working through and we’ll point you to the right lesson, resource or mentor support.</p><button class="button button-dark" id="helpStart">Explore support <span>→</span></button>`));

document.addEventListener('click', (event) => {
  if (event.target.id === 'messageSent' || event.target.id === 'profileSaved' || event.target.id === 'helpStart') { closeModal(); showToast('Your space is ready.', 'This action will connect to your live account in production.'); }
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
        ? 'Change the password for this email. You will use it to sign in on other devices.'
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
    showToast('Signed in.', 'Your paid courses are unlocked on this device.');
    await syncCourseAccess();
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
    await syncCourseAccess();
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

async function syncCourseAccess() {
  await window.GradflowEnrollment.loadPublishedCatalog();
  const refresh = await window.GradflowEnrollment.refreshFromServer();
  setAuthForms({
    session: Boolean(refresh.session),
    hasAccount: Boolean(refresh.hasAccount),
    email: refresh.email || window.GradflowEnrollment.getStudentEmail(),
  });
  const course = primaryCourse();
  const unlocked = Boolean(course && window.GradflowEnrollment.isEnrolled(course.id));
  const banner = document.getElementById('learning');
  const lesson = document.getElementById('lessonCard');
  const continueButton = document.getElementById('continueButton');
  const title = document.getElementById('learningTitle');
  if (title) title.textContent = course?.name || 'Your learning';
  banner.classList.toggle('is-locked', !unlocked);
  lesson.classList.toggle('is-locked', !unlocked);
  document.getElementById('learningBadge').textContent = unlocked ? 'KEEP YOUR MOMENTUM' : 'COURSE LOCKED';
  document.getElementById('learningCopy').textContent = unlocked
    ? (course.blurb || 'Your paid course is ready.')
    : course
      ? `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll to open lessons.`
      : 'Publish a course in admin to list it here.';
  continueButton.innerHTML = unlocked ? 'Continue learning <span>→</span>' : course ? 'Pay and enroll to unlock <span>→</span>' : 'Browse courses <span>→</span>';
  document.getElementById('resumeLesson').innerHTML = unlocked ? 'Resume sprint <span>→</span>' : 'Unlock this lesson <span>→</span>';
  let percent = 0;
  if (unlocked) {
    const detail = await window.GradflowEnrollment.loadStudentCourse(course.id);
    percent = detail?.progress?.percent || 0;
    if (detail?.resume?.label) continueButton.innerHTML = `${detail.resume.label} <span>→</span>`;
  }
  const progressLabel = document.getElementById('courseProgress');
  const progressBar = document.getElementById('progressBar');
  if (progressLabel) progressLabel.textContent = String(percent);
  if (progressBar) progressBar.style.width = `${percent}%`;

  const list = document.getElementById('courseAccessList');
  list.replaceChildren();
  if (!window.GradflowEnrollment.catalog.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-locked-note';
    empty.textContent = 'No published courses yet. Add one in the admin portal.';
    list.appendChild(empty);
  }
  await renderReferralCard(Boolean(refresh.session));
  window.GradflowEnrollment.catalog.forEach((course) => {
    const enrolled = window.GradflowEnrollment.isEnrolled(course.id);
    const link = document.createElement('a');
    link.className = 'dash-course-link';
    link.href = window.GradflowEnrollment.courseUrl(course.id);
    link.innerHTML = `<span><strong>${course.name}</strong><small>${enrolled ? 'Paid and enrolled — open content' : `${window.GradflowEnrollment.formatPrice(course.price)} · locked until you enroll`}</small></span><span class="access-pill ${enrolled ? 'enrolled' : 'locked'}">${enrolled ? 'Enrolled' : 'Locked'}</span>`;
    list.appendChild(link);
  });
}

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

async function renderReferralCard(signedIn) {
  const card = document.getElementById('referralCard');
  if (!card) return;
  if (!signedIn) {
    card.innerHTML = '<p class="dash-locked-note" id="referralEmpty">Sign in to see your referral link and earnings.</p>';
    return;
  }
  const result = await window.GradflowEnrollment.referralDashboard();
  if (!result.ok) {
    card.innerHTML = '<p class="dash-locked-note">Referral earnings will appear here after the program is configured.</p>';
    return;
  }
  const data = result.data;
  const disclosure = document.getElementById('referralDisclosure');
  if (disclosure && data.disclosure) disclosure.textContent = data.disclosure;
  if (!data.enabled) {
    card.innerHTML = '<p class="dash-locked-note">The referral program is not enabled yet.</p>';
    return;
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Join this Gradflow course with my referral link: ${data.link}`)}`;
  card.innerHTML = `
    <div class="today-title"><div><p class="mini-eyebrow">YOUR REFERRAL LINK</p><h3>${escapeHtml(data.code)}</h3></div></div>
    <p class="dash-locked-note">${escapeHtml(data.link)}</p>
    <div class="referral-actions">
      <button class="button button-dark button-sm" type="button" id="copyReferral">Copy link</button>
      <a class="button button-lime button-sm" id="whatsappReferral" href="${whatsapp}" target="_blank" rel="noreferrer">WhatsApp</a>
      <button class="button button-dark button-sm" type="button" id="shareReferral">Share</button>
    </div>
    <div class="referral-stats">
      <span>Clicks <strong>${data.clicks || 0}</strong></span>
      <span>Registrations <strong>${data.registrations || 0}</strong></span>
      <span>Successful <strong>${data.successfulReferrals || 0}</strong></span>
    </div>
    <div class="referral-stats">
      <span>Pending <strong>${moneyPaise(data.balances?.pending)}</strong></span>
      <span>Available <strong>${moneyPaise(data.balances?.available)}</strong></span>
      <span>Paid <strong>${moneyPaise(data.balances?.paid)}</strong></span>
      <span>Reversed <strong>${moneyPaise(data.balances?.reversed)}</strong></span>
    </div>
    ${data.acceptedTerms ? '' : '<button class="text-action" type="button" id="acceptReferralTerms">Accept referral terms</button>'}
    <form class="referral-payout" id="payoutForm">
      <p class="mini-eyebrow">PAYOUT METHOD</p>
      <label>Method
        <select name="method">
          ${(data.methods || ['UPI', 'BANK']).map((method) => `<option ${data.payout?.method === method ? 'selected' : ''}>${method}</option>`).join('')}
        </select>
      </label>
      <label>UPI ID<input name="upiId" placeholder="name@upi" value=""></label>
      <label>Account number<input name="accountNumber" autocomplete="off"></label>
      <label>IFSC<input name="ifsc" autocomplete="off"></label>
      <label>Account holder<input name="holderName" value="${escapeHtml(data.payout?.holderName || '')}"></label>
      <p class="dash-locked-note">${data.payout ? `Saved ${escapeHtml(data.payout.method)} ${escapeHtml(data.payout.upiId || data.payout.accountNumber || '')}` : 'Payout details are stored encrypted and shown masked.'}</p>
      <button class="button button-dark button-sm" type="submit">Save payout method</button>
    </form>
    ${data.withdrawalEnabled ? `
      <form class="referral-payout" id="withdrawForm">
        <p class="mini-eyebrow">WITHDRAW</p>
        <label>Amount (INR)<input name="amountRupees" required inputmode="decimal"></label>
        <label>Method
          <select name="method">
            ${(data.methods || ['UPI']).map((method) => `<option>${method}</option>`).join('')}
          </select>
        </label>
        <button class="button button-lime button-sm" type="submit">Request withdrawal</button>
      </form>
    ` : ''}
    <div class="referral-activity">
      ${(data.recent || []).map((row) => `<p>${escapeHtml(row.referredMasked || row.referred)} · ${escapeHtml(row.status)} · ${moneyPaise(row.amountPaise)}</p>`).join('') || '<p class="dash-locked-note">No successful referrals yet.</p>'}
    </div>
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
    renderReferralCard(true);
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
    });
    if (!saved.ok) {
      showToast('Payout method not saved.', saved.data.error || 'Try again.');
      return;
    }
    showToast('Payout method saved.', 'Account numbers stay masked after save.');
    renderReferralCard(true);
  });
  document.getElementById('withdrawForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
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
    renderReferralCard(true);
  });
}

syncCourseAccess();
