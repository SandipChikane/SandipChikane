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

function resumeLearning() {
  openModal(`<p class="mini-eyebrow">MODULE 06 · LESSON 03</p><h2>Find the story<br />in the <em>data.</em></h2><p>Today you’ll turn a real retail dataset into an insight your stakeholder can use. Your saved notes and project brief are ready.</p><button class="button button-lime" id="startLesson">Start the 42 minute sprint <span>→</span></button>`);
  document.getElementById('startLesson').addEventListener('click', () => {
    closeModal();
    showToast('Lesson opened.', 'Your sprint timer and notes are ready.');
  });
}

document.getElementById('continueButton').addEventListener('click', () => requireAnalytics(resumeLearning));
document.getElementById('resumeLesson').addEventListener('click', () => requireAnalytics(resumeLearning));

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
      goToCourse(ANALYTICS_COURSE);
      return;
    }
    const project = button.dataset.project;
    openModal(`<p class="mini-eyebrow">PROJECT WORKSPACE</p><h2>${project}<br /><em>is ready.</em></h2><p>Open your project brief, see the next milestone and add your work when you’re ready. Your feedback history will stay attached to this project.</p><button class="button button-dark" id="projectOpen">Open workspace <span>↗</span></button>`);
    document.getElementById('projectOpen').addEventListener('click', () => { closeModal(); showToast('Workspace opened.', `Welcome back to ${project}.`); });
  });
});

function newProject() {
  if (!analyticsUnlocked()) {
    goToCourse(ANALYTICS_COURSE);
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
  await window.GradflowEnrollment.studentLogout();
  applyStudentIdentity('');
  const chip = document.getElementById('studentChipName');
  if (chip) chip.textContent = 'Student';
  if (studentName) studentName.textContent = 'there.';
  showToast('Signed out.', 'Sign in again to reopen paid courses.');
  await syncCourseAccess();
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

  const list = document.getElementById('courseAccessList');
  list.replaceChildren();
  if (!window.GradflowEnrollment.catalog.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-locked-note';
    empty.textContent = 'No published courses yet. Add one in the admin portal.';
    list.appendChild(empty);
  }
  window.GradflowEnrollment.catalog.forEach((course) => {
    const enrolled = window.GradflowEnrollment.isEnrolled(course.id);
    const link = document.createElement('a');
    link.className = 'dash-course-link';
    link.href = window.GradflowEnrollment.courseUrl(course.id);
    link.innerHTML = `<span><strong>${course.name}</strong><small>${enrolled ? 'Paid and enrolled — open content' : `${window.GradflowEnrollment.formatPrice(course.price)} · locked until you enroll`}</small></span><span class="access-pill ${enrolled ? 'enrolled' : 'locked'}">${enrolled ? 'Enrolled' : 'Locked'}</span>`;
    list.appendChild(link);
  });
}

syncCourseAccess();
