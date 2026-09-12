const params = new URLSearchParams(window.location.search);
const course = window.GradflowEnrollment.courseById(params.get('course'))
  || window.GradflowEnrollment.courseByName(params.get('course'));
const lockedState = document.getElementById('lockedState');
const unlockedState = document.getElementById('unlockedState');
const missingState = document.getElementById('missingState');
const toast = document.getElementById('courseToast');
let toastTimer;

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function renderUnlocked() {
  const record = window.GradflowEnrollment.studentEnrollments()[course.id];
  document.title = `${course.name} — Gradflow`;
  document.getElementById('openTitle').innerHTML = `${course.name.replace(' ', '<br />')}`;
  document.getElementById('openBlurb').textContent = `${course.blurb} Your project: ${course.project}.`;
  if (record?.enrolledAt) {
    const enrolledOn = new Date(record.enrolledAt);
    document.getElementById('enrolledOn').textContent = `Enrolled ${enrolledOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const modules = document.getElementById('moduleList');
  modules.replaceChildren();
  course.modules.forEach((module) => {
    const item = document.createElement('li');
    item.innerHTML = `<b>${module.number}</b><span>${module.title}</span><span>${module.time}</span>`;
    modules.appendChild(item);
  });
  document.getElementById('lessonType').textContent = `${course.lesson.type} · MODULE ${course.lesson.number}`;
  document.getElementById('lessonTitle').textContent = course.lesson.title;
  document.getElementById('lessonCopy').textContent = course.lesson.copy;
  document.getElementById('lessonTime').textContent = `${course.lesson.minutes} min · ${course.tools.join(' · ')}`;
  lockedState.hidden = true;
  unlockedState.hidden = false;
  missingState.hidden = true;
}

function renderLocked() {
  document.title = `Locked · ${course.name} — Gradflow`;
  document.getElementById('lockedTitle').innerHTML = `Unlock <em>${course.name}</em>`;
  document.getElementById('lockedBlurb').textContent = `${course.blurb} Enroll to open the syllabus, current lesson, and ${course.project}.`;
  document.getElementById('lockedPrice').textContent = window.GradflowEnrollment.formatPrice(course.price);
  document.getElementById('lockedMeta').textContent = `${course.weeks} weeks · ${course.tools.join(' · ')}`;
  document.getElementById('payButton').textContent = `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`;
  const email = window.GradflowEnrollment.getStudentEmail();
  if (email) document.getElementById('enrollEmail').value = email;
  lockedState.hidden = false;
  unlockedState.hidden = true;
  missingState.hidden = true;
}

if (!course) {
  missingState.hidden = false;
  lockedState.hidden = true;
  unlockedState.hidden = true;
} else if (window.GradflowEnrollment.isEnrolled(course.id)) {
  renderUnlocked();
} else {
  renderLocked();
}

document.getElementById('enrollForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('enrollEmail').value.trim();
  if (!email) return;
  window.GradflowEnrollment.setStudentEmail(email);
  window.GradflowEnrollment.enroll(course.id);
  renderUnlocked();
  showToast('Payment complete.', `${course.name} is unlocked. TPOs never see this payment.`);
  unlockedState.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('startContent')?.addEventListener('click', () => {
  document.getElementById('currentLesson').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
