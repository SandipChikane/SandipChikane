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

  const courseTrigger = event.target.closest('[data-course]');
  if (courseTrigger) openModal('course', courseTrigger.dataset.course);

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
    if (email) localStorage.setItem('gradflowStudentEmail', email);
    window.location.href = 'dashboard.html';
    return;
  }
  if (modalContent.dataset.type === 'tpo') {
    const name = event.target.querySelector('[name="name"]')?.value.trim();
    const email = event.target.querySelector('[name="email"]')?.value.trim();
    const college = event.target.querySelector('[name="college"]')?.value.trim();
    if (name) localStorage.setItem('gradflowTpoName', name);
    if (email) localStorage.setItem('gradflowTpoEmail', email);
    if (college) localStorage.setItem('gradflowTpoCollege', college);
    window.location.href = 'tpo.html';
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
