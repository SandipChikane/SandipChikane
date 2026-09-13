const ENROLLMENT_KEY = 'gradflowEnrollments';
const STUDENT_EMAIL_KEY = 'gradflowStudentEmail';
const STUDENT_COLLEGE_KEY = 'gradflowStudentCollege';
const GUEST_KEY = 'guest';

const COURSE_CATALOG = [];

function loadAllEnrollments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ENROLLMENT_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllEnrollments(all) {
  localStorage.setItem(ENROLLMENT_KEY, JSON.stringify(all));
}

function getStudentEmail() {
  return (localStorage.getItem(STUDENT_EMAIL_KEY) || '').trim();
}

function studentKey() {
  return getStudentEmail() || GUEST_KEY;
}

function setStudentEmail(email) {
  const next = (email || '').trim();
  if (!next) return getStudentEmail();
  const all = loadAllEnrollments();
  const current = studentKey();
  const incoming = all[next] || {};
  const previous = all[current] || {};
  all[next] = { ...previous, ...incoming };
  if (current !== next) delete all[current];
  saveAllEnrollments(all);
  localStorage.setItem(STUDENT_EMAIL_KEY, next);
  return next;
}

function getStudentCollege() {
  return (localStorage.getItem(STUDENT_COLLEGE_KEY) || '').trim();
}

function setStudentCollege(college) {
  const next = (college || '').trim();
  if (next) localStorage.setItem(STUDENT_COLLEGE_KEY, next);
  return getStudentCollege();
}

function studentEnrollments() {
  return loadAllEnrollments()[studentKey()] || {};
}

function courseById(id) {
  return COURSE_CATALOG.find((course) => course.id === id) || null;
}

function courseByName(name) {
  return COURSE_CATALOG.find((course) => course.name === name) || null;
}

function isEnrolled(courseId) {
  const record = studentEnrollments()[courseId];
  return Boolean(record && record.paid);
}

function cacheEnrollment(record) {
  if (!record || !record.paid || !record.courseId) return null;
  const course = courseById(record.courseId);
  const all = loadAllEnrollments();
  const key = studentKey();
  all[key] = all[key] || {};
  all[key][record.courseId] = {
    paid: true,
    courseId: record.courseId,
    courseName: record.courseName || course?.name || record.courseId,
    enrolledAt: record.enrolledAt || new Date().toISOString(),
  };
  saveAllEnrollments(all);
  return all[key][record.courseId];
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function loadPublishedCatalog() {
  COURSE_CATALOG.splice(0, COURSE_CATALOG.length);
  try {
    const result = await apiRequest('/api/catalog');
    const remote = (result.data.courses || []).filter((course) => course.status !== 'archived');
    remote.forEach((course) => COURSE_CATALOG.push(course));
    return COURSE_CATALOG;
  } catch {
    return COURSE_CATALOG;
  }
}

async function publicConfig() {
  try {
    const result = await apiRequest('/api/public-config');
    return result.data;
  } catch {
    return { paymentsReady: false, supabaseReady: false };
  }
}

function clearLocalAccess() {
  const all = loadAllEnrollments();
  delete all[studentKey()];
  saveAllEnrollments(all);
}

function applyServerEnrollments(payload = {}) {
  const email = payload.email;
  if (email) setStudentEmail(email);
  const rows = payload.enrollments || [];
  rows.forEach((row) => cacheEnrollment(row));
  return rows;
}

async function refreshFromServer() {
  try {
    const result = await apiRequest('/api/enrollments');
    if (result.status === 503) return { ok: false, configured: false, enrollments: [], session: false };
    if (result.status === 401) {
      clearLocalAccess();
      return { ok: false, configured: true, enrollments: [], session: false };
    }
    if (!result.ok) return { ok: false, configured: true, enrollments: [], session: false };
    const rows = applyServerEnrollments(result.data);
    return {
      ok: true,
      configured: true,
      session: true,
      email: result.data.email || getStudentEmail(),
      hasAccount: Boolean(result.data.hasAccount),
      enrollments: rows,
    };
  } catch {
    return { ok: false, configured: false, enrollments: [], session: false };
  }
}

async function studentLogin({ email, password }) {
  const result = await apiRequest('/api/student-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (result.ok) applyServerEnrollments(result.data);
  return result;
}

async function setStudentPassword({ password, currentPassword } = {}) {
  return apiRequest('/api/student-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, currentPassword }),
  });
}

async function studentSession() {
  return apiRequest('/api/student-session');
}

function goToLanding() {
  window.location.assign('/');
}

async function studentLogout() {
  const result = await apiRequest('/api/student-logout', { method: 'POST' });
  clearLocalAccess();
  return result;
}

async function createOrder({ courseId, email, college, password }) {
  return apiRequest('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, email, college, password }),
  });
}

async function verifyPayment(payload) {
  return apiRequest('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function tpoSession({ name, email, college, accessCode }) {
  return apiRequest('/api/tpo-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, college, accessCode }),
  });
}

async function tpoLogout() {
  return apiRequest('/api/tpo-logout', { method: 'POST' });
}

async function tpoEnrollments(college) {
  return apiRequest(`/api/tpo-enrollments?college=${encodeURIComponent(college)}`);
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.head.appendChild(script);
  });
}

function formatPrice(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function courseUrl(courseId, extra = {}) {
  const params = new URLSearchParams({ course: courseId });
  if (extra.section) params.set('section', extra.section);
  if (extra.lesson) params.set('lesson', extra.lesson);
  return `course.html?${params}`;
}

async function loadStudentCourse(id, { preview = false, section = '' } = {}) {
  if (!id) return null;
  const query = new URLSearchParams({ id });
  if (preview) query.set('preview', '1');
  if (section) query.set('section', section);
  const result = await apiRequest(`/api/catalog-course?${query}`);
  if (!result.ok || !result.data.course) return null;
  return result.data;
}

async function markLessonComplete(courseId, lessonId) {
  return apiRequest('/api/lesson-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, lessonId, status: 'completed' }),
  });
}

window.GradflowEnrollment = {
  catalog: COURSE_CATALOG,
  getStudentEmail,
  setStudentEmail,
  getStudentCollege,
  setStudentCollege,
  studentEnrollments,
  courseById,
  courseByName,
  isEnrolled,
  cacheEnrollment,
  publicConfig,
  loadPublishedCatalog,
  refreshFromServer,
  studentLogin,
  setStudentPassword,
  studentSession,
  studentLogout,
  goToLanding,
  clearLocalAccess,
  createOrder,
  verifyPayment,
  tpoSession,
  tpoLogout,
  tpoEnrollments,
  loadRazorpay,
  formatPrice,
  courseUrl,
  loadStudentCourse,
  markLessonComplete,
};
