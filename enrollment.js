const ENROLLMENT_KEY = 'gradflowEnrollments';
const STUDENT_EMAIL_KEY = 'gradflowStudentEmail';
const STUDENT_COLLEGE_KEY = 'gradflowStudentCollege';
const GUEST_KEY = 'guest';

const COURSE_CATALOG = [
  {
    id: 'data-analytics',
    name: 'Data Analytics in the Wild',
    category: 'analytics',
    weeks: 16,
    price: 14900,
    blurb: 'Turn messy data into decisions people act on.',
    tools: ['Excel', 'SQL', 'Power BI'],
    modules: [
      { number: '01', title: 'Data hygiene that teams trust', time: '2 weeks' },
      { number: '02', title: 'SQL for messy campus datasets', time: '2 weeks' },
      { number: '03', title: 'Exploratory analysis in Excel', time: '2 weeks' },
      { number: '04', title: 'Power BI that tells a story', time: '3 weeks' },
      { number: '05', title: 'Stakeholder questions, not just charts', time: '2 weeks' },
      { number: '06', title: 'Retail Pulse project sprint', time: '3 weeks' },
    ],
    lesson: {
      number: '06',
      type: 'PROJECT SPRINT',
      title: 'Retail Pulse: find the story in the data',
      minutes: 42,
      copy: 'Use a real retail dataset to uncover the one metric a product team should care about.',
    },
    project: 'Retail Pulse Dashboard',
  },
  {
    id: 'web-dev',
    name: 'Modern Web Development',
    category: 'tech',
    weeks: 14,
    price: 16900,
    blurb: 'Design, build and deploy products that work.',
    tools: ['React', 'Git', 'AI'],
    modules: [
      { number: '01', title: 'Ship a page in the first week', time: '2 weeks' },
      { number: '02', title: 'Components, state and real data', time: '3 weeks' },
      { number: '03', title: 'Git habits teams expect', time: '2 weeks' },
      { number: '04', title: 'AI as a careful pair-programmer', time: '2 weeks' },
      { number: '05', title: 'Deploy and tell the story', time: '2 weeks' },
      { number: '06', title: 'Portfolio product sprint', time: '3 weeks' },
    ],
    lesson: {
      number: '04',
      type: 'BUILD LAB',
      title: 'Turn a campus brief into a working UI',
      minutes: 38,
      copy: 'Build a small, explainable interface from a real placement-cell brief.',
    },
    project: 'Placement portal revamp',
  },
  {
    id: 'product-design',
    name: 'Product Design Foundations',
    category: 'design',
    weeks: 12,
    price: 12900,
    blurb: 'Go from user insight to a case study with impact.',
    tools: ['Figma', 'Notion'],
    modules: [
      { number: '01', title: 'Find the real user problem', time: '2 weeks' },
      { number: '02', title: 'Flows before polish', time: '2 weeks' },
      { number: '03', title: 'Figma that other people can use', time: '3 weeks' },
      { number: '04', title: 'Critique and iterate', time: '2 weeks' },
      { number: '05', title: 'Write the case study', time: '3 weeks' },
    ],
    lesson: {
      number: '03',
      type: 'STUDIO',
      title: 'Make student finances less intimidating',
      minutes: 35,
      copy: 'Map the anxiety in a student money tool, then design one calmer path through it.',
    },
    project: 'Student finance case study',
  },
  {
    id: 'business-analytics',
    name: 'Business Analytics',
    category: 'analytics',
    weeks: 10,
    price: 9900,
    blurb: 'Make sharper decisions with data.',
    tools: ['Excel', 'Sheets', 'Looker'],
    modules: [
      { number: '01', title: 'Questions before spreadsheets', time: '2 weeks' },
      { number: '02', title: 'Metrics a hiring manager trusts', time: '2 weeks' },
      { number: '03', title: 'From raw export to recommendation', time: '3 weeks' },
      { number: '04', title: 'Decision memo sprint', time: '3 weeks' },
    ],
    lesson: {
      number: '03',
      type: 'CASE SPRINT',
      title: 'Recommend one campus drive change',
      minutes: 30,
      copy: 'Turn a placement-drive export into a single recommendation your TPO could act on.',
    },
    project: 'Drive conversion model',
  },
  {
    id: 'ai-for-work',
    name: 'AI for Work',
    category: 'tech',
    weeks: 12,
    price: 11900,
    blurb: 'Use AI as a thoughtful co-pilot.',
    tools: ['ChatGPT', 'Notion', 'Gemini'],
    modules: [
      { number: '01', title: 'Prompts that leave a paper trail', time: '2 weeks' },
      { number: '02', title: 'Research without inventing facts', time: '3 weeks' },
      { number: '03', title: 'Draft, critique, rewrite', time: '3 weeks' },
      { number: '04', title: 'Ship an AI-assisted workflow', time: '4 weeks' },
    ],
    lesson: {
      number: '02',
      type: 'WORKSHOP',
      title: 'Build a resume review copilot',
      minutes: 36,
      copy: 'Design a careful AI helper that improves a resume without hiding your voice.',
    },
    project: 'Resume review copilot',
  },
];

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
  try {
    const result = await apiRequest('/api/catalog');
    const remote = result.data.courses || [];
    if (!remote.length) return COURSE_CATALOG;
    remote.forEach((incoming) => {
      const index = COURSE_CATALOG.findIndex((course) => course.id === incoming.id);
      const previous = COURSE_CATALOG[index] || {};
      const next = {
        ...previous,
        ...incoming,
        modules: incoming.modules?.length ? incoming.modules : previous.modules || [],
        lesson: incoming.lesson?.title ? incoming.lesson : previous.lesson,
        tools: incoming.tools?.length ? incoming.tools : previous.tools || [],
      };
      if (index >= 0) COURSE_CATALOG[index] = next;
      else COURSE_CATALOG.push(next);
    });
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

function courseUrl(courseId) {
  return `course.html?course=${encodeURIComponent(courseId)}`;
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
  clearLocalAccess,
  createOrder,
  verifyPayment,
  tpoSession,
  tpoEnrollments,
  loadRazorpay,
  formatPrice,
  courseUrl,
};
