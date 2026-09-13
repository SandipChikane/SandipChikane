const modal = document.getElementById('dashboardModal');
const modalContent = document.getElementById('dashboardModalContent');
const modalClose = document.getElementById('dashboardModalClose');
const toast = document.getElementById('dashToast');
const studentName = document.getElementById('studentFirstName');
const savedEmail = window.GradflowEnrollment.getStudentEmail();
const ANALYTICS_COURSE = 'data-analytics';

if (savedEmail) {
  const first = savedEmail.split('@')[0].split(/[._-]/)[0];
  if (first) studentName.textContent = first.charAt(0).toUpperCase() + first.slice(1) + '.';
}

function analyticsUnlocked() {
  return window.GradflowEnrollment.isEnrolled(ANALYTICS_COURSE);
}

function goToCourse(courseId) {
  window.location.href = window.GradflowEnrollment.courseUrl(courseId);
}

function requireAnalytics(openUnlocked) {
  if (!analyticsUnlocked()) {
    goToCourse(ANALYTICS_COURSE);
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

async function syncCourseAccess() {
  await window.GradflowEnrollment.refreshFromServer();
  const unlocked = analyticsUnlocked();
  const banner = document.getElementById('learning');
  const lesson = document.getElementById('lessonCard');
  const continueButton = document.getElementById('continueButton');
  banner.classList.toggle('is-locked', !unlocked);
  lesson.classList.toggle('is-locked', !unlocked);
  document.getElementById('learningBadge').textContent = unlocked ? 'KEEP YOUR MOMENTUM' : 'COURSE LOCKED';
  document.getElementById('learningCopy').textContent = unlocked
    ? 'Module 6 of 8 · Turning numbers into a compelling story'
    : `Pay ${window.GradflowEnrollment.formatPrice(window.GradflowEnrollment.courseById(ANALYTICS_COURSE).price)} and enroll to open lessons.`;
  continueButton.innerHTML = unlocked ? 'Continue learning <span>→</span>' : 'Pay and enroll to unlock <span>→</span>';
  document.getElementById('resumeLesson').innerHTML = unlocked ? 'Resume sprint <span>→</span>' : 'Unlock this lesson <span>→</span>';

  const list = document.getElementById('courseAccessList');
  list.replaceChildren();
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
