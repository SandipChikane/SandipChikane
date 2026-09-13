const modalBackdrop = document.getElementById('modalBackdrop');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const toast = document.getElementById('toast');
let toastTimer;

function openModal(type, courseName = '') {
  const templateId = `${type}ModalTemplate`;
  const template = document.getElementById(templateId);
  if (!template) return;
  modalContent.replaceChildren(template.content.cloneNode(true));
  modalContent.dataset.type = type;
  const dynamicCourse = modalContent.querySelector('.dynamic-course');
  if (dynamicCourse && courseName) dynamicCourse.textContent = courseName;
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => modalContent.querySelector('input')?.focus(), 100);
}

function closeModal() {
  modalBackdrop.classList.remove('show');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showToast(message, detail) {
  toast.querySelector('strong').textContent = message;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

document.addEventListener('click', (event) => {
  const modalTrigger = event.target.closest('[data-open-modal]');
  if (modalTrigger) openModal(modalTrigger.dataset.openModal);

  const courseTrigger = event.target.closest('[data-course-id], [data-course]');
  if (courseTrigger) {
    const course = window.GradflowEnrollment.courseById(courseTrigger.dataset.courseId)
      || window.GradflowEnrollment.courseByName(courseTrigger.dataset.course);
    if (course) {
      window.location.href = window.GradflowEnrollment.courseUrl(course.id);
      return;
    }
    openModal('course', courseTrigger.dataset.course);
  }

  const scrollTrigger = event.target.closest('[data-scroll]');
  if (scrollTrigger) {
    document.querySelector(scrollTrigger.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
    if (modalBackdrop.classList.contains('show')) closeModal();
  }

  if (event.target === modalBackdrop || event.target === modalClose) closeModal();
});

document.addEventListener('submit', (event) => {
  if (!event.target.matches('.lead-form')) return;
  event.preventDefault();
  if (modalContent.dataset.type === 'login') {
    const email = event.target.querySelector('input[type="email"]')?.value.trim();
    const password = event.target.querySelector('input[type="password"]')?.value;
    const submit = event.target.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    window.GradflowEnrollment.studentLogin({ email, password }).then((result) => {
      if (!result.ok) {
        if (submit) submit.disabled = false;
        showToast('Could not sign in.', result.data.error || 'Check your email and password.');
        return;
      }
      window.location.href = 'dashboard.html';
    }).catch(() => {
      if (submit) submit.disabled = false;
      showToast('Could not sign in.', 'Check your email and password, then try again.');
    });
    return;
  }
  if (modalContent.dataset.type === 'tpo') {
    const name = event.target.querySelector('[name="name"]')?.value.trim();
    const email = event.target.querySelector('[name="email"]')?.value.trim();
    const college = event.target.querySelector('[name="college"]')?.value.trim();
    const accessCode = event.target.querySelector('[name="accessCode"]')?.value.trim();
    if (name) localStorage.setItem('gradflowTpoName', name);
    if (email) localStorage.setItem('gradflowTpoEmail', email);
    if (college) localStorage.setItem('gradflowTpoCollege', college);
    window.GradflowEnrollment.tpoSession({ name, email, college, accessCode }).then((result) => {
      if (!result.ok) {
        showToast('TPO workspace stayed locked.', result.data.error || 'Check the access code.');
        return;
      }
      window.location.href = 'tpo.html';
    }).catch(() => {
      showToast('TPO workspace stayed locked.', 'Could not open a TPO session.');
    });
    return;
  }
  closeModal();
  showToast('You’re on the list.', 'We’ll be in touch with the next steps.');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalBackdrop.classList.contains('show')) closeModal();
});

const filters = document.querySelectorAll('[data-filter]');
filters.forEach((filter) => {
  filter.addEventListener('click', () => {
    const value = filter.dataset.filter;
    document.querySelectorAll('.course-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.filter === value));
    document.querySelectorAll('.course-card').forEach((card) => {
      card.style.display = value === 'all' || card.dataset.category === value ? '' : 'none';
    });
  });
});

const menuToggle = document.getElementById('menuToggle');
const header = document.querySelector('.site-header');
menuToggle?.addEventListener('click', () => {
  const isOpen = header.classList.toggle('menu-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.desktop-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    header.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const storiesTrack = document.getElementById('storiesTrack');
let storyPosition = 0;
document.getElementById('nextStory')?.addEventListener('click', () => {
  storyPosition = Math.min(storyPosition + 1, 2);
  storiesTrack.style.transform = `translateX(-${storyPosition * 28}%)`;
});
document.getElementById('prevStory')?.addEventListener('click', () => {
  storyPosition = Math.max(storyPosition - 1, 0);
  storiesTrack.style.transform = `translateX(-${storyPosition * 28}%)`;
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function syncAccessPills() {
  document.querySelectorAll('[data-access-for]').forEach((row) => {
    const enrolled = window.GradflowEnrollment.isEnrolled(row.dataset.accessFor);
    const pill = row.querySelector('.access-pill');
    if (!pill) return;
    pill.classList.toggle('locked', !enrolled);
    pill.classList.toggle('enrolled', enrolled);
    pill.textContent = enrolled ? 'Enrolled' : 'Locked';
    const price = row.querySelector('.course-price');
    const course = window.GradflowEnrollment.courseById(row.dataset.accessFor);
    if (price && course) price.textContent = window.GradflowEnrollment.formatPrice(course.price);
  });
}

syncAccessPills();

window.GradflowEnrollment.publicConfig?.().then((config) => {
  const copy = document.getElementById('announcementCopy');
  if (copy && config?.announcement) copy.textContent = config.announcement;
});

window.GradflowEnrollment.loadPublishedCatalog?.().then(() => {
  syncAccessPills();
  const grid = document.querySelector('.course-grid');
  if (!grid) return;
  const existing = new Set([...document.querySelectorAll('[data-course-id]')].map((node) => node.dataset.courseId));
  window.GradflowEnrollment.catalog.forEach((course) => {
    if (existing.has(course.id) || course.status === 'archived') return;
    const card = document.createElement('article');
    card.className = 'course-card compact-card';
    card.dataset.category = course.category || 'analytics';
    card.innerHTML = `
      <div class="compact-icon">＋</div>
      <div>
        <div class="course-meta"><span>${escapeHtml((course.category || 'course').toUpperCase())}</span><span>${escapeHtml(course.weeks || 0)} WEEKS</span></div>
        <h3>${escapeHtml(course.name)}</h3>
        <p>${escapeHtml(course.blurb || '')}</p>
        <div class="access-row" data-access-for="${escapeHtml(course.id)}">
          <span class="course-price">${window.GradflowEnrollment.formatPrice(course.price)}</span>
          <span class="access-pill locked">Locked</span>
        </div>
      </div>
      <button class="round-arrow" data-course-id="${escapeHtml(course.id)}" data-course="${escapeHtml(course.name)}" aria-label="Open ${escapeHtml(course.name)}">↗</button>`;
    grid.appendChild(card);
  });
  syncAccessPills();
});
