const toast = document.getElementById('adminToast');
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const content = document.getElementById('adminContent');
const state = {
  session: null,
  overview: null,
  courses: [],
  media: [],
  enrollments: [],
  students: [],
  colleges: [],
  settings: {},
  audit: [],
  editor: null,
  filter: '',
  courseStatus: 'all',
  mediaKind: 'all',
  enrollmentQuery: '',
  studentQuery: '',
  dirty: false,
};

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(window.adminToastTimer);
  window.adminToastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  if (url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin/') {
    url.searchParams.set('action', url.pathname.replace(/^\/api\/admin\//, ''));
    url.pathname = '/api/admin';
  }
  const response = await fetch(`${url.pathname}${url.search}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function moneyPaise(paise) {
  const amount = Number(paise) || 0;
  const rupees = Math.trunc(amount / 100);
  const rem = Math.abs(amount % 100);
  const formatted = rupees.toLocaleString('en-IN');
  return rem ? `₹${formatted}.${String(rem).padStart(2, '0')}` : `₹${formatted}`;
}

function paiseToRupeesField(paise) {
  const amount = Number(paise) || 0;
  const rem = amount % 100;
  return rem ? `${Math.trunc(amount / 100)}.${String(rem).padStart(2, '0')}` : String(Math.trunc(amount / 100));
}

function rupeesFieldToPaise(value) {
  const text = String(value || '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function percentFromBps(bps) {
  const amount = Number(bps) || 0;
  const rem = amount % 100;
  return rem ? `${Math.trunc(amount / 100)}.${String(rem).padStart(2, '0')}` : String(Math.trunc(amount / 100));
}

function percentToBps(value) {
  const text = String(value || '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function defaultReferral() {
  return {
    referralEnabled: true,
    referralActive: true,
    campaignStart: '',
    campaignEnd: '',
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function currentView() {
  const hash = (location.hash || '#overview').slice(1);
  if (hash.startsWith('course/')) return { name: 'editor', id: hash.slice(7) };
  return { name: hash || 'overview' };
}

function setNav(name) {
  document.querySelectorAll('#adminNav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === name || (name === 'editor' && link.dataset.view === 'courses'));
  });
}

async function boot() {
  try {
    state.session = await api('/api/admin/session');
    showApp();
    await render();
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  document.getElementById('adminEmailLabel').textContent = state.session?.email || 'admin';
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const passwordInput = document.getElementById('loginPassword');
    state.session = await api('/api/admin/login', {
      method: 'POST',
      body: {
        email: document.getElementById('loginEmail').value,
        password: passwordInput.value,
      },
    });
    passwordInput.value = '';
    showApp();
    location.hash = '#overview';
    await render();
  } catch (error) {
    showToast('Sign-in failed.', error.message);
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST', body: {} });
  } finally {
    window.location.assign('/');
  }
});

document.getElementById('dashMenu')?.addEventListener('click', () => {
  document.querySelector('.dash-sidebar')?.classList.toggle('open');
});

window.addEventListener('hashchange', () => {
  if (state.dirty && currentView().name !== 'editor' && !confirm('Leave without saving this course?')) {
    location.hash = state.editor?.id ? `#course/${state.editor.id}` : '#course/new';
    return;
  }
  if (currentView().name !== 'editor') state.dirty = false;
  render().catch((error) => showToast('Could not open that page.', error.message));
});

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

async function render() {
  const view = currentView();
  setNav(view.name === 'editor' ? 'courses' : view.name);
  if (view.name === 'overview') return renderOverview();
  if (view.name === 'courses') return renderCourses();
  if (view.name === 'editor') return renderEditor(view.id);
  if (view.name === 'media') return renderMedia();
  if (view.name === 'enrollments') return renderEnrollments();
  if (view.name === 'students') return renderStudents();
  if (view.name === 'colleges') return renderColleges();
  if (view.name === 'referrals') return renderReferrals();
  if (view.name === 'withdrawals') return renderWithdrawals();
  if (view.name === 'settings') return renderSettings();
  if (view.name === 'audit') return renderAudit();
  return renderOverview();
}

async function renderOverview() {
  state.overview = await api('/api/admin/overview');
  const data = state.overview;
  content.innerHTML = `
    <p class="dashboard-eyebrow">TODAY</p>
    <div class="admin-toolbar"><h1>Catalog <em>control.</em></h1></div>
    <div class="admin-kpis">
      <article><small>COURSES</small><strong>${data.courses}</strong></article>
      <article><small>PUBLISHED</small><strong>${data.published}</strong></article>
      <article><small>PAID ENROLLMENTS</small><strong>${data.enrollments}</strong></article>
      <article><small>REVENUE</small><strong>${money(data.revenue)}</strong></article>
      <article><small>STUDENTS</small><strong>${data.students}</strong></article>
      <article><small>COLLEGES</small><strong>${data.colleges}</strong></article>
      <article><small>VIDEOS</small><strong>${data.videos}</strong></article>
      <article><small>IMAGES</small><strong>${data.images}</strong></article>
    </div>
    <div class="admin-grid">
      <section class="admin-panel">
        <p class="mini-eyebrow">RECENT ENROLLMENTS</p>
        ${data.recentEnrollments.length ? data.recentEnrollments.map((row) => `<p><strong>${escapeHtml(row.studentName || row.studentEmail)}</strong><small>${escapeHtml(row.courseName)} · ${escapeHtml(row.college || '—')}</small></p>`).join('') : '<p class="admin-empty">No paid enrollments yet.</p>'}
      </section>
      <section class="admin-panel">
        <p class="mini-eyebrow">ACTIVITY</p>
        ${data.recentAudit.length ? data.recentAudit.map((row) => `<p><strong>${escapeHtml(row.action)}</strong><small>${escapeHtml(row.entity || '')} ${escapeHtml(row.entity_id || '')}</small></p>`).join('') : '<p class="admin-empty">No admin activity yet.</p>'}
        <div class="admin-actions">
          <a href="#courses">Open course list</a>
        </div>
      </section>
    </div>
    ${(data.withdrawalNotices || []).length ? `
      <section class="admin-panel" style="margin-top:18px">
        <p class="mini-eyebrow">NEW WITHDRAWAL REQUEST</p>
        ${(data.withdrawalNotices || []).map((row) => `
          <p>
            <strong>${escapeHtml(row.userEmail || '')}</strong>
            <small>${moneyPaise(row.amountPaise)} · ${escapeHtml(row.method || '')} · ${escapeHtml(row.status || 'OPEN')} · ${escapeHtml(row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN') : '')}</small>
          </p>
        `).join('')}
        <div class="admin-actions"><a href="#withdrawals">Open withdrawal requests</a></div>
      </section>
    ` : ''}`;
}

async function renderCourses() {
  const data = await api('/api/admin/courses');
  state.courses = data.courses || [];
  const query = state.filter.toLowerCase();
  const rows = state.courses.filter((course) => {
    const haystack = `${course.name} ${course.id} ${course.category}`.toLowerCase();
    const matchesQuery = haystack.includes(query);
    const matchesStatus = state.courseStatus === 'all' || course.status === state.courseStatus;
    return matchesQuery && matchesStatus;
  });
  content.innerHTML = `
    <div class="admin-toolbar">
      <div>
        <p class="dashboard-eyebrow">CATALOG</p>
        <h1>Every <em>path.</em></h1>
      </div>
      <div>
        <input id="courseSearch" type="search" placeholder="Search courses" value="${escapeHtml(state.filter)}" />
        <div class="admin-actions">
          <a href="#course/new">Create a course</a>
          <button type="button" id="exportCourses">Export JSON</button>
          <label class="admin-inline">Import JSON<input id="importCourses" type="file" accept="application/json" hidden></label>
        </div>
      </div>
    </div>
    <div class="admin-filters">
      ${['all', 'published', 'draft', 'archived'].map((status) => `
        <button type="button" class="${state.courseStatus === status ? 'on' : ''}" data-status-filter="${status}">${status}</button>
      `).join('')}
    </div>
    <div class="admin-grid">
      ${rows.map((course) => `
        <article class="admin-course-card">
          ${course.coverImageUrl ? `<img src="${escapeHtml(course.coverImageUrl)}" alt="">` : `<div class="admin-cover">${escapeHtml(course.category)}</div>`}
          <div>
            <span class="admin-status ${course.status}">${course.status}</span>
            <h3>${escapeHtml(course.name)}</h3>
            <p>${escapeHtml(course.blurb || 'No description yet.')}</p>
            <div class="admin-pills"><span>${money(course.price)}</span><span>${course.weeks} weeks</span><span>${escapeHtml(course.category)}</span></div>
            <div class="admin-actions">
              <a href="#course/${encodeURIComponent(course.id)}">Edit</a>
              <a href="/course.html?course=${encodeURIComponent(course.id)}&preview=1" target="_blank" rel="noreferrer">Preview</a>
              ${course.status !== 'published' ? `<button type="button" data-set-status="${escapeHtml(course.id)}:published">Publish</button>` : `<button type="button" data-set-status="${escapeHtml(course.id)}:draft">Unpublish</button>`}
              ${course.status !== 'archived' ? `<button type="button" data-set-status="${escapeHtml(course.id)}:archived">Archive</button>` : ''}
              <button type="button" data-dup="${escapeHtml(course.id)}">Duplicate</button>
              <button type="button" data-del="${escapeHtml(course.id)}">Delete</button>
            </div>
          </div>
        </article>`).join('') || '<p class="admin-empty">No courses match. Seed the built-in catalog from Overview, or create one.</p>'}
    </div>`;
  document.getElementById('courseSearch')?.addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderCourses();
  });
  content.querySelectorAll('[data-status-filter]').forEach((button) => button.addEventListener('click', () => {
    state.courseStatus = button.dataset.statusFilter;
    renderCourses();
  }));
  document.getElementById('exportCourses')?.addEventListener('click', async () => {
    const exported = await api('/api/admin/export');
    downloadFile('gradflow-courses.json', JSON.stringify(exported, null, 2), 'application/json');
    showToast('Catalog exported.', `${exported.courses.length} courses downloaded.`);
  });
  document.getElementById('importCourses')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = await api('/api/admin/import', { method: 'POST', body: payload });
      showToast('Catalog imported.', `${result.imported} course${result.imported === 1 ? '' : 's'} saved.`);
      renderCourses();
    } catch (error) {
      showToast('Import failed.', error.message);
    }
  });
  content.querySelectorAll('[data-set-status]').forEach((button) => button.addEventListener('click', async () => {
    const [id, status] = button.dataset.setStatus.split(':');
    await api('/api/admin/course-status', { method: 'POST', body: { id, status } });
    showToast('Status updated.', `${id} is now ${status}.`);
    renderCourses();
  }));
  content.querySelectorAll('[data-dup]').forEach((button) => button.addEventListener('click', async () => {
    const result = await api('/api/admin/duplicate', { method: 'POST', body: { id: button.dataset.dup } });
    location.hash = `#course/${result.course.id}`;
  }));
  content.querySelectorAll('[data-del]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this course and its syllabus?')) return;
    await api(`/api/admin/course?id=${encodeURIComponent(button.dataset.del)}`, { method: 'DELETE' });
    showToast('Course deleted.', 'It is no longer in the catalog.');
    renderCourses();
  }));
}

function blankLesson() {
  return { title: '', type: 'LESSON', minutes: 20, copy: '', isCurrent: false };
}

function blankModule(index = 0) {
  return {
    number: String(index + 1).padStart(2, '0'),
    title: '',
    time: '',
    description: '',
    lessons: [blankLesson()],
  };
}

function blankSection(index = 0) {
  return {
    title: '',
    slug: '',
    shortDescription: '',
    fullDescription: '',
    thumbnailUrl: '',
    icon: '',
    status: 'draft',
    estimatedMinutes: 0,
    prerequisiteIds: [],
    modules: [blankModule(0)],
    sortOrder: index,
  };
}

function blankCourse() {
  return {
    id: '',
    name: '',
    category: 'analytics',
    weeks: 12,
    price: 0,
    blurb: '',
    tools: [],
    project: '',
    coverImageUrl: '',
    thumbnailUrl: '',
    promoVideoUrl: '',
    status: 'draft',
    featured: false,
    sortOrder: 0,
    seoTitle: '',
    seoDescription: '',
    referral: defaultReferral(),
    sections: [blankSection(0)],
    modules: [],
    lessons: [],
    lesson: {},
  };
}

function ensureHierarchy(course) {
  if (!course) return blankCourse();
  course.referral = { ...defaultReferral(), ...(course.referral || {}) };
  if (!Array.isArray(course.sections) || !course.sections.length) {
    const lessons = course.lessons || [];
    const modules = (course.modules || []).map((module, index) => ({
      ...module,
      lessons: lessons.filter((lesson) => Number(lesson.moduleIndex ?? -1) === index || lesson.moduleId === module.id),
    }));
    course.sections = [{
      title: course.name || 'Course path',
      slug: 'course-path',
      shortDescription: course.blurb || '',
      fullDescription: '',
      thumbnailUrl: course.thumbnailUrl || '',
      icon: '',
      status: 'published',
      estimatedMinutes: 0,
      prerequisiteIds: [],
      modules: modules.length ? modules : [blankModule(0)],
    }];
  }
  course.sections.forEach((section, sectionIndex) => {
    section.modules = Array.isArray(section.modules) && section.modules.length ? section.modules : [blankModule(0)];
    section.prerequisiteIds = Array.isArray(section.prerequisiteIds) ? section.prerequisiteIds : [];
    section.sortOrder = sectionIndex;
    section.modules.forEach((module) => {
      module.lessons = Array.isArray(module.lessons) && module.lessons.length ? module.lessons : [blankLesson()];
    });
  });
  return course;
}

function cloneWithoutIds(value) {
  const copy = JSON.parse(JSON.stringify(value || {}));
  delete copy.id;
  delete copy.sectionId;
  delete copy.moduleId;
  delete copy.courseId;
  (copy.modules || []).forEach((module) => {
    delete module.id;
    delete module.sectionId;
    (module.lessons || []).forEach((lesson) => {
      delete lesson.id;
      delete lesson.moduleId;
    });
  });
  (copy.lessons || []).forEach((lesson) => {
    delete lesson.id;
    delete lesson.moduleId;
  });
  return copy;
}

async function renderEditor(id) {
  if (id === 'new') {
    state.editor = blankCourse();
  } else {
    const data = await api(`/api/admin/course?id=${encodeURIComponent(id)}`);
    state.editor = ensureHierarchy(data.course);
  }
  paintEditor();
}

function paintEditor() {
  const course = state.editor;
  content.innerHTML = `
    <form class="admin-form" id="courseForm">
      <div class="admin-toolbar">
        <div>
          <p class="dashboard-eyebrow">COURSE EDITOR</p>
          <h1>${course.id ? escapeHtml(course.name || course.id) : 'New <em>course.</em>'}</h1>
        </div>
        <div class="admin-actions">
          <button class="button button-lime" type="submit">Save course</button>
          <button class="button button-dark button-sm" type="button" id="publishNow">Save and publish</button>
          ${course.id ? `<a href="/course.html?course=${encodeURIComponent(course.id)}&preview=1" target="_blank" rel="noreferrer">Preview</a>` : ''}
          <a href="#courses">Back to list</a>
        </div>
      </div>
      <div class="admin-form-grid">
        <label>Course id / slug<input name="id" value="${escapeHtml(course.id)}" ${course.createdAt ? 'readonly' : ''} placeholder="data-analytics" required></label>
        <label>Title<input name="name" value="${escapeHtml(course.name)}" required></label>
        <label>Category
          <input name="category" list="categoryOptions" value="${escapeHtml(course.category || 'analytics')}">
          <datalist id="categoryOptions">
            <option value="analytics"></option>
            <option value="tech"></option>
            <option value="design"></option>
            <option value="business"></option>
          </datalist>
        </label>
        <label>Status
          <select name="status">
            ${['draft', 'published', 'archived'].map((item) => `<option ${course.status === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </label>
        <label>Price (INR)<input name="price" type="number" min="0" value="${escapeHtml(course.price)}"></label>
        <label>Weeks<input name="weeks" type="number" min="1" value="${escapeHtml(course.weeks)}"></label>
        <label>Featured
          <select name="featured">
            <option value="false" ${!course.featured ? 'selected' : ''}>No</option>
            <option value="true" ${course.featured ? 'selected' : ''}>Yes</option>
          </select>
        </label>
        <label>Sort order<input name="sortOrder" type="number" value="${escapeHtml(course.sortOrder || 0)}"></label>
        <label class="wide">Short description<textarea name="blurb">${escapeHtml(course.blurb)}</textarea></label>
        <label>Project name<input name="project" value="${escapeHtml(course.project || '')}"></label>
        <label>Tools (comma separated)<input name="tools" value="${escapeHtml((course.tools || []).join(', '))}"></label>
        <label class="wide">SEO title<input name="seoTitle" value="${escapeHtml(course.seoTitle || '')}"></label>
        <label class="wide">SEO description<textarea name="seoDescription">${escapeHtml(course.seoDescription || '')}</textarea></label>
      </div>

      <section class="admin-section">
        <p class="mini-eyebrow">MEDIA</p>
        <h2>Images and <em>video.</em></h2>
        <label>Cover image URL<input name="coverImageUrl" value="${escapeHtml(course.coverImageUrl || '')}"></label>
        <label class="admin-drop" data-drop="cover">Drop or choose a cover image<input type="file" accept="image/*" data-upload="coverImageUrl"></label>
        ${course.coverImageUrl ? `<div class="admin-preview"><img src="${escapeHtml(course.coverImageUrl)}" alt=""></div>` : ''}
        <label>Thumbnail URL<input name="thumbnailUrl" value="${escapeHtml(course.thumbnailUrl || '')}"></label>
        <label class="admin-drop">Upload thumbnail<input type="file" accept="image/*" data-upload="thumbnailUrl"></label>
        <label>Promo video URL<input name="promoVideoUrl" value="${escapeHtml(course.promoVideoUrl || '')}"></label>
        <label class="admin-drop" data-drop="promo">Drop or choose a promo video<input type="file" accept="video/*" data-upload="promoVideoUrl"></label>
        ${course.promoVideoUrl ? `<div class="admin-preview"><video src="${escapeHtml(course.promoVideoUrl)}" controls></video></div>` : ''}
      </section>

      <section class="admin-section">
        <p class="mini-eyebrow">COURSE BUILDER</p>
        <h2>Learning sections, <em>modules,</em> lessons.</h2>
        <p class="admin-builder-copy">Students see this hierarchy after they buy the course. Add as many sections as the path needs — nothing here is hardcoded.</p>
        <div class="admin-builder-toolbar">
          <button class="button button-dark button-sm" type="button" id="addSection">Add learning section</button>
          ${course.id ? `<a href="/course.html?course=${encodeURIComponent(course.id)}&preview=1" target="_blank" rel="noreferrer">Preview student view</a>` : ''}
        </div>
        <div class="admin-builder" id="builderTree">${(course.sections || []).map((section, sectionIndex) => sectionFields(section, sectionIndex, course)).join('')}</div>
      </section>

      <section class="admin-section">
        <p class="mini-eyebrow">REFERRAL SETTINGS</p>
        <h2>Direct referral <em>eligibility.</em></h2>
        <p class="admin-builder-copy">Commission uses the fixed backend rate on the actual eligible amount paid. That rate cannot be changed here. These controls only decide whether this course can create a referral commission.</p>
        <div class="admin-form-grid">
          <label>Referral enabled
            <select name="referralEnabled">
              <option value="true" ${course.referral.referralEnabled ? 'selected' : ''}>Yes</option>
              <option value="false" ${!course.referral.referralEnabled ? 'selected' : ''}>No</option>
            </select>
          </label>
          <label>Referral active
            <select name="referralActive">
              <option value="true" ${course.referral.referralActive ? 'selected' : ''}>Yes</option>
              <option value="false" ${!course.referral.referralActive ? 'selected' : ''}>No</option>
            </select>
          </label>
          <label>Campaign start<input name="referralCampaignStart" type="datetime-local" value="${escapeHtml((course.referral.campaignStart || '').slice(0, 16))}"></label>
          <label>Campaign end<input name="referralCampaignEnd" type="datetime-local" value="${escapeHtml((course.referral.campaignEnd || '').slice(0, 16))}"></label>
        </div>
      </section>
    </form>`;

  document.getElementById('courseForm').addEventListener('submit', saveEditor);
  document.getElementById('courseForm').addEventListener('input', () => { state.dirty = true; });
  document.getElementById('publishNow').addEventListener('click', async (event) => {
    event.preventDefault();
    await persistEditor({ publish: true });
  });
  document.getElementById('addSection')?.addEventListener('click', () => {
    syncEditorForm();
    state.editor.sections.push(blankSection(state.editor.sections.length));
    state.dirty = true;
    paintEditor();
  });
  bindBuilderActions();
  bindDropZone(content.querySelector('[data-drop="cover"]'), async (file) => {
    const url = await uploadFile(file, state.editor.id || 'drafts');
    syncEditorForm();
    state.editor.coverImageUrl = url;
    state.dirty = true;
    paintEditor();
  });
  bindDropZone(content.querySelector('[data-drop="promo"]'), async (file) => {
    const url = await uploadFile(file, state.editor.id || 'drafts');
    syncEditorForm();
    state.editor.promoVideoUrl = url;
    state.dirty = true;
    paintEditor();
  });
  content.querySelectorAll('[data-upload]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await uploadFile(file, state.editor.id || 'drafts');
        syncEditorForm();
        state.editor[input.dataset.upload] = url;
        state.dirty = true;
        paintEditor();
        showToast('File uploaded.', file.name);
      } catch (error) {
        showToast('Upload failed.', error.message);
      }
    });
  });
  content.querySelectorAll('[data-section-upload]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const [sectionIndex, field] = input.dataset.sectionUpload.split(':');
      try {
        const url = await uploadFile(file, state.editor.id || 'drafts');
        syncEditorForm();
        state.editor.sections[Number(sectionIndex)][field] = url;
        state.dirty = true;
        paintEditor();
        showToast('Section image uploaded.', file.name);
      } catch (error) {
        showToast('Upload failed.', error.message);
      }
    });
  });
  content.querySelectorAll('[data-lesson-upload]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const [sectionIndex, moduleIndex, lessonIndex, field] = input.dataset.lessonUpload.split(':');
      try {
        const url = await uploadFile(file, state.editor.id || 'drafts');
        syncEditorForm();
        state.editor.sections[Number(sectionIndex)].modules[Number(moduleIndex)].lessons[Number(lessonIndex)][field] = url;
        state.dirty = true;
        paintEditor();
        showToast('Lesson file uploaded.', file.name);
      } catch (error) {
        showToast('Upload failed.', error.message);
      }
    });
  });
}

function sectionFields(section, sectionIndex, course) {
  const prereqOptions = (course.sections || [])
    .map((item, index) => {
      if (index === sectionIndex || !item.id) return '';
      const selected = (section.prerequisiteIds || []).includes(item.id) ? 'selected' : '';
      return `<option value="${escapeHtml(item.id)}" ${selected}>${escapeHtml(item.title || `Section ${index + 1}`)}</option>`;
    })
    .join('');
  const preview = course.id && section.slug
    ? `<a href="/course.html?course=${encodeURIComponent(course.id)}&amp;section=${encodeURIComponent(section.slug)}&amp;preview=1" target="_blank" rel="noreferrer">Preview</a>`
    : '';
  return `
    <article class="admin-section-card" data-drop="s:${sectionIndex}">
      <div class="admin-tree-head">
        <button type="button" class="admin-drag" draggable="true" data-path="s:${sectionIndex}" aria-label="Drag learning section">☰</button>
        <div>
          <p class="mini-eyebrow">LEARNING SECTION ${String(sectionIndex + 1).padStart(2, '0')}</p>
          <strong>${escapeHtml(section.title || 'Untitled section')}</strong>
        </div>
        <span class="admin-status ${section.status === 'published' ? 'published' : 'draft'}">${section.status === 'published' ? 'published' : 'draft'}</span>
        <div class="admin-row-tools">
          <button type="button" data-move="s:${sectionIndex}:-1">Up</button>
          <button type="button" data-move="s:${sectionIndex}:1">Down</button>
          <button type="button" data-toggle-status="${sectionIndex}">${section.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button type="button" data-dup="s:${sectionIndex}">Duplicate</button>
          ${preview}
          <button type="button" data-remove="s:${sectionIndex}">Delete</button>
        </div>
      </div>
      <div class="admin-form-grid">
        <label>Title<input name="section-title-${sectionIndex}" value="${escapeHtml(section.title || '')}" required></label>
        <label>Slug<input name="section-slug-${sectionIndex}" value="${escapeHtml(section.slug || '')}" placeholder="learn-sql"></label>
        <label class="wide">Short description<textarea name="section-short-${sectionIndex}">${escapeHtml(section.shortDescription || '')}</textarea></label>
        <label class="wide">Full description<textarea name="section-full-${sectionIndex}">${escapeHtml(section.fullDescription || '')}</textarea></label>
        <label>Icon / mark<input name="section-icon-${sectionIndex}" value="${escapeHtml(section.icon || '')}" placeholder="Optional emoji or short mark"></label>
        <label>Estimated minutes<input name="section-minutes-${sectionIndex}" type="number" min="0" value="${escapeHtml(section.estimatedMinutes || 0)}"></label>
        <label>Status
          <select name="section-status-${sectionIndex}">
            <option value="draft" ${section.status !== 'published' ? 'selected' : ''}>Draft</option>
            <option value="published" ${section.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </label>
        <label>Prerequisites
          <select name="section-prereq-${sectionIndex}" multiple>${prereqOptions || '<option disabled>Save once to link other sections</option>'}</select>
        </label>
        <label class="wide">Thumbnail URL<input name="section-thumb-${sectionIndex}" value="${escapeHtml(section.thumbnailUrl || '')}"></label>
      </div>
      <label class="admin-drop">Upload section thumbnail<input type="file" accept="image/*" data-section-upload="${sectionIndex}:thumbnailUrl"></label>
      ${section.thumbnailUrl ? `<div class="admin-preview"><img src="${escapeHtml(section.thumbnailUrl)}" alt=""></div>` : ''}
      <div class="admin-builder-toolbar">
        <button class="admin-inline" type="button" data-add-module="${sectionIndex}">Add module</button>
      </div>
      ${(section.modules || []).map((module, moduleIndex) => moduleFields(module, sectionIndex, moduleIndex)).join('')}
    </article>`;
}

function moduleFields(module, sectionIndex, moduleIndex) {
  return `
    <div class="admin-module" data-drop="m:${sectionIndex}:${moduleIndex}">
      <div class="admin-tree-head">
        <button type="button" class="admin-drag" draggable="true" data-path="m:${sectionIndex}:${moduleIndex}" aria-label="Drag module">☰</button>
        <div>
          <p class="mini-eyebrow">MODULE ${escapeHtml(module.number || String(moduleIndex + 1).padStart(2, '0'))}</p>
          <strong>${escapeHtml(module.title || 'Untitled module')}</strong>
        </div>
        <div class="admin-row-tools">
          <button type="button" data-move="m:${sectionIndex}:${moduleIndex}:-1">Up</button>
          <button type="button" data-move="m:${sectionIndex}:${moduleIndex}:1">Down</button>
          <button type="button" data-dup="m:${sectionIndex}:${moduleIndex}">Duplicate</button>
          <button type="button" data-remove="m:${sectionIndex}:${moduleIndex}">Delete</button>
        </div>
      </div>
      <label>Number<input name="module-number-${sectionIndex}-${moduleIndex}" value="${escapeHtml(module.number || '')}"></label>
      <label>Title<input name="module-title-${sectionIndex}-${moduleIndex}" value="${escapeHtml(module.title || '')}"></label>
      <label>Duration<input name="module-time-${sectionIndex}-${moduleIndex}" value="${escapeHtml(module.time || module.duration || '')}"></label>
      <label>Description<textarea name="module-description-${sectionIndex}-${moduleIndex}">${escapeHtml(module.description || '')}</textarea></label>
      <div class="admin-builder-toolbar">
        <button class="admin-inline" type="button" data-add-lesson="${sectionIndex}:${moduleIndex}">Add lesson</button>
      </div>
      ${(module.lessons || []).map((lesson, lessonIndex) => lessonFields(lesson, sectionIndex, moduleIndex, lessonIndex)).join('')}
    </div>`;
}

function lessonFields(lesson, sectionIndex, moduleIndex, lessonIndex) {
  return `
    <div class="admin-lesson" data-drop="l:${sectionIndex}:${moduleIndex}:${lessonIndex}">
      <div class="admin-tree-head">
        <button type="button" class="admin-drag" draggable="true" data-path="l:${sectionIndex}:${moduleIndex}:${lessonIndex}" aria-label="Drag lesson">☰</button>
        <div>
          <p class="mini-eyebrow">${escapeHtml(lesson.type || 'LESSON')}</p>
          <strong>${escapeHtml(lesson.title || 'Untitled lesson')}</strong>
        </div>
        <div class="admin-row-tools">
          <button type="button" data-move="l:${sectionIndex}:${moduleIndex}:${lessonIndex}:-1">Up</button>
          <button type="button" data-move="l:${sectionIndex}:${moduleIndex}:${lessonIndex}:1">Down</button>
          <button type="button" data-dup="l:${sectionIndex}:${moduleIndex}:${lessonIndex}">Duplicate</button>
          <button type="button" data-remove="l:${sectionIndex}:${moduleIndex}:${lessonIndex}">Delete</button>
        </div>
      </div>
      <label>Title<input name="lesson-title-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.title || '')}"></label>
      <label>Type<input name="lesson-type-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.type || 'LESSON')}"></label>
      <label>Minutes<input name="lesson-minutes-${sectionIndex}-${moduleIndex}-${lessonIndex}" type="number" value="${escapeHtml(lesson.minutes || 0)}"></label>
      <label>Current lesson
        <select name="lesson-current-${sectionIndex}-${moduleIndex}-${lessonIndex}">
          <option value="false" ${!lesson.isCurrent ? 'selected' : ''}>No</option>
          <option value="true" ${lesson.isCurrent ? 'selected' : ''}>Yes</option>
        </select>
      </label>
      <label>Copy<textarea name="lesson-copy-${sectionIndex}-${moduleIndex}-${lessonIndex}">${escapeHtml(lesson.copy || '')}</textarea></label>
      <label>Video URL<input name="lesson-video-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.videoUrl || '')}"></label>
      <label class="admin-drop">Upload lesson video<input type="file" accept="video/*" data-lesson-upload="${sectionIndex}:${moduleIndex}:${lessonIndex}:videoUrl"></label>
      <label>Image URL<input name="lesson-image-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.imageUrl || '')}"></label>
      <label class="admin-drop">Upload lesson image<input type="file" accept="image/*" data-lesson-upload="${sectionIndex}:${moduleIndex}:${lessonIndex}:imageUrl"></label>
      <label>Resource URL<input name="lesson-resource-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.resourceUrl || '')}"></label>
      <label>Resource label<input name="lesson-resource-label-${sectionIndex}-${moduleIndex}-${lessonIndex}" value="${escapeHtml(lesson.resourceLabel || '')}"></label>
      ${lesson.videoUrl ? `<div class="admin-preview"><video src="${escapeHtml(lesson.videoUrl)}" controls></video></div>` : ''}
    </div>`;
}

function bindBuilderActions() {
  content.querySelectorAll('[data-add-module]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const section = state.editor.sections[Number(button.dataset.addModule)];
    section.modules.push(blankModule(section.modules.length));
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-add-lesson]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const [sectionIndex, moduleIndex] = button.dataset.addLesson.split(':').map(Number);
    state.editor.sections[sectionIndex].modules[moduleIndex].lessons.push(blankLesson());
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-toggle-status]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const section = state.editor.sections[Number(button.dataset.toggleStatus)];
    section.status = section.status === 'published' ? 'draft' : 'published';
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-dup]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    duplicatePath(parsePath(button.dataset.dup));
  }));
  content.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    removePath(parsePath(button.dataset.remove));
  }));
  content.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const parts = button.dataset.move.split(':');
    const delta = Number(parts.pop());
    nudgePath(parsePath(parts.join(':')), delta);
  }));
  content.querySelectorAll('.admin-drag').forEach((handle) => {
    handle.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      event.dataTransfer.setData('text/plain', handle.dataset.path);
      event.dataTransfer.effectAllowed = 'move';
      handle.closest('[data-drop]')?.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      content.querySelectorAll('.dragging, .drop-target').forEach((node) => node.classList.remove('dragging', 'drop-target'));
    });
  });
  content.querySelectorAll('[data-drop]').forEach((node) => {
    node.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.add('drop-target');
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove('drop-target');
      const from = parsePath(event.dataTransfer.getData('text/plain'));
      const to = parsePath(node.dataset.drop);
      syncEditorForm();
      relocatePath(from, to);
    });
  });
}

function parsePath(value) {
  const [kind, ...parts] = String(value || '').split(':');
  return { kind, indexes: parts.map(Number) };
}

function duplicatePath(path) {
  const sections = state.editor.sections;
  if (path.kind === 's') {
    const copy = cloneWithoutIds(sections[path.indexes[0]]);
    copy.title = `${copy.title || 'Section'} copy`;
    copy.slug = '';
    copy.status = 'draft';
    sections.splice(path.indexes[0] + 1, 0, copy);
  } else if (path.kind === 'm') {
    const list = sections[path.indexes[0]].modules;
    const copy = cloneWithoutIds(list[path.indexes[1]]);
    copy.title = `${copy.title || 'Module'} copy`;
    list.splice(path.indexes[1] + 1, 0, copy);
  } else if (path.kind === 'l') {
    const list = sections[path.indexes[0]].modules[path.indexes[1]].lessons;
    const copy = cloneWithoutIds(list[path.indexes[2]]);
    copy.title = `${copy.title || 'Lesson'} copy`;
    copy.isCurrent = false;
    list.splice(path.indexes[2] + 1, 0, copy);
  }
  state.dirty = true;
  paintEditor();
}

function removePath(path) {
  const sections = state.editor.sections;
  if (path.kind === 's') {
    if (sections.length <= 1) {
      showToast('Keep one section.', 'A course needs at least one learning section.');
      return;
    }
    if (!confirm('Delete this learning section and its modules?')) return;
    sections.splice(path.indexes[0], 1);
  } else if (path.kind === 'm') {
    const list = sections[path.indexes[0]].modules;
    if (list.length <= 1) {
      showToast('Keep one module.', 'Add another module before deleting this one.');
      return;
    }
    if (!confirm('Delete this module and its lessons?')) return;
    list.splice(path.indexes[1], 1);
  } else if (path.kind === 'l') {
    const list = sections[path.indexes[0]].modules[path.indexes[1]].lessons;
    if (list.length <= 1) {
      showToast('Keep one lesson.', 'Add another lesson before deleting this one.');
      return;
    }
    list.splice(path.indexes[2], 1);
  }
  state.dirty = true;
  paintEditor();
}

function nudgePath(path, delta) {
  if (path.kind === 's') moveItem(state.editor.sections, path.indexes[0], delta);
  if (path.kind === 'm') moveItem(state.editor.sections[path.indexes[0]].modules, path.indexes[1], delta);
  if (path.kind === 'l') moveItem(state.editor.sections[path.indexes[0]].modules[path.indexes[1]].lessons, path.indexes[2], delta);
  state.dirty = true;
  paintEditor();
}

function relocatePath(from, to) {
  if (!from?.kind || !to?.kind) return;
  const sections = state.editor.sections;
  if (from.kind === 's' && to.kind === 's') {
    const [item] = sections.splice(from.indexes[0], 1);
    let dest = to.indexes[0];
    if (from.indexes[0] < dest) dest -= 1;
    sections.splice(dest, 0, item);
  } else if (from.kind === 'm' && (to.kind === 'm' || to.kind === 's')) {
    const [item] = sections[from.indexes[0]].modules.splice(from.indexes[1], 1);
    const destSection = to.indexes[0];
    const destList = sections[destSection].modules;
    let destIndex = to.kind === 'm' ? to.indexes[1] : destList.length;
    if (from.indexes[0] === destSection && from.indexes[1] < destIndex) destIndex -= 1;
    destList.splice(Math.max(0, destIndex), 0, item);
  } else if (from.kind === 'l' && (to.kind === 'l' || to.kind === 'm')) {
    const [item] = sections[from.indexes[0]].modules[from.indexes[1]].lessons.splice(from.indexes[2], 1);
    const destSection = to.indexes[0];
    const destModule = to.kind === 'l' ? to.indexes[1] : to.indexes[1];
    const destList = sections[destSection].modules[destModule].lessons;
    let destIndex = to.kind === 'l' ? to.indexes[2] : destList.length;
    if (from.indexes[0] === destSection && from.indexes[1] === destModule && from.indexes[2] < destIndex) destIndex -= 1;
    destList.splice(Math.max(0, destIndex), 0, item);
  } else {
    return;
  }
  state.dirty = true;
  paintEditor();
}

function syncEditorForm() {
  const form = document.getElementById('courseForm');
  if (!form) return;
  const data = new FormData(form);
  const course = state.editor;
  course.id = String(data.get('id') || '').trim();
  course.name = String(data.get('name') || '').trim();
  course.category = String(data.get('category') || 'analytics');
  course.status = String(data.get('status') || 'draft');
  course.price = Number(data.get('price') || 0);
  course.weeks = Number(data.get('weeks') || 0);
  course.featured = data.get('featured') === 'true';
  course.sortOrder = Number(data.get('sortOrder') || 0);
  course.blurb = String(data.get('blurb') || '');
  course.project = String(data.get('project') || '');
  course.tools = String(data.get('tools') || '').split(',').map((item) => item.trim()).filter(Boolean);
  course.seoTitle = String(data.get('seoTitle') || '');
  course.seoDescription = String(data.get('seoDescription') || '');
  course.coverImageUrl = String(data.get('coverImageUrl') || '');
  course.thumbnailUrl = String(data.get('thumbnailUrl') || '');
  course.promoVideoUrl = String(data.get('promoVideoUrl') || '');
  course.referral = {
    referralEnabled: data.get('referralEnabled') === 'true',
    referralActive: data.get('referralActive') === 'true',
    campaignStart: String(data.get('referralCampaignStart') || ''),
    campaignEnd: String(data.get('referralCampaignEnd') || ''),
  };
  course.sections = (course.sections || []).map((section, sectionIndex) => ({
    ...section,
    title: String(data.get(`section-title-${sectionIndex}`) || ''),
    slug: String(data.get(`section-slug-${sectionIndex}`) || ''),
    shortDescription: String(data.get(`section-short-${sectionIndex}`) || ''),
    fullDescription: String(data.get(`section-full-${sectionIndex}`) || ''),
    icon: String(data.get(`section-icon-${sectionIndex}`) || ''),
    estimatedMinutes: Number(data.get(`section-minutes-${sectionIndex}`) || 0),
    status: data.get(`section-status-${sectionIndex}`) === 'published' ? 'published' : 'draft',
    thumbnailUrl: String(data.get(`section-thumb-${sectionIndex}`) || section.thumbnailUrl || ''),
    prerequisiteIds: data.getAll(`section-prereq-${sectionIndex}`).filter(Boolean),
    modules: (section.modules || []).map((module, moduleIndex) => ({
      ...module,
      number: String(data.get(`module-number-${sectionIndex}-${moduleIndex}`) || ''),
      title: String(data.get(`module-title-${sectionIndex}-${moduleIndex}`) || ''),
      time: String(data.get(`module-time-${sectionIndex}-${moduleIndex}`) || ''),
      description: String(data.get(`module-description-${sectionIndex}-${moduleIndex}`) || ''),
      lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
        ...lesson,
        title: String(data.get(`lesson-title-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || ''),
        type: String(data.get(`lesson-type-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || 'LESSON'),
        minutes: Number(data.get(`lesson-minutes-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || 0),
        isCurrent: data.get(`lesson-current-${sectionIndex}-${moduleIndex}-${lessonIndex}`) === 'true',
        copy: String(data.get(`lesson-copy-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || ''),
        videoUrl: String(data.get(`lesson-video-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || lesson.videoUrl || ''),
        imageUrl: String(data.get(`lesson-image-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || lesson.imageUrl || ''),
        resourceUrl: String(data.get(`lesson-resource-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || ''),
        resourceLabel: String(data.get(`lesson-resource-label-${sectionIndex}-${moduleIndex}-${lessonIndex}`) || ''),
      })),
    })),
  }));
  const current = course.sections.flatMap((section) => section.modules.flatMap((module) => module.lessons)).find((lesson) => lesson.isCurrent)
    || course.sections[0]?.modules?.[0]?.lessons?.[0];
  course.lesson = current || course.lesson;
}

async function saveEditor(event) {
  event.preventDefault();
  await persistEditor();
}

async function persistEditor({ publish = false } = {}) {
  syncEditorForm();
  if (publish) state.editor.status = 'published';
  try {
    const result = await api('/api/admin/course', { method: 'POST', body: state.editor });
    state.editor = result.course;
    state.dirty = false;
    showToast('Course saved.', `${result.course.name} is ${result.course.status}.`);
    if (location.hash !== `#course/${result.course.id}`) {
      location.hash = `#course/${result.course.id}`;
    } else {
      paintEditor();
    }
  } catch (error) {
    showToast('Save failed.', error.message);
  }
}

async function uploadFile(file, courseId) {
  const signed = await api('/api/admin/upload-sign', {
    method: 'POST',
    body: { filename: file.name, contentType: file.type, courseId },
  });
  const upload = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(signed.token ? { Authorization: `Bearer ${signed.token}` } : {}),
    },
    body: file,
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(text.slice(0, 180) || 'Storage upload failed.');
  }
  await api('/api/admin/media', {
    method: 'POST',
    body: {
      path: signed.path,
      publicUrl: signed.publicUrl,
      kind: signed.kind,
      title: file.name,
      courseId,
      mimeType: file.type,
      sizeBytes: file.size,
      bucket: signed.bucket,
    },
  });
  return signed.publicUrl;
}

async function renderMedia() {
  const data = await api('/api/admin/media');
  state.media = data.media || [];
  const rows = state.media.filter((item) => state.mediaKind === 'all' || item.kind === state.mediaKind);
  content.innerHTML = `
    <div class="admin-toolbar">
      <div><p class="dashboard-eyebrow">LIBRARY</p><h1>Videos and <em>images.</em></h1></div>
    </div>
    <div class="admin-filters">
      ${['all', 'image', 'video', 'file'].map((kind) => `
        <button type="button" class="${state.mediaKind === kind ? 'on' : ''}" data-media-kind="${kind}">${kind}</button>
      `).join('')}
    </div>
    <label class="admin-drop" id="mediaDrop">Drop or choose a file to upload
      <input id="mediaUpload" type="file" accept="image/*,video/*,.pdf,.zip">
    </label>
    <div class="admin-media-grid">
      ${rows.map((item) => `
        <article class="admin-media-item">
          ${item.kind === 'video' ? `<video src="${escapeHtml(item.public_url)}" controls></video>` : item.kind === 'image' ? `<img src="${escapeHtml(item.public_url)}" alt="">` : `<div class="admin-cover">FILE</div>`}
          <p><strong>${escapeHtml(item.title || item.path)}</strong><small>${escapeHtml(item.kind)} · ${escapeHtml(item.course_id || 'unattached')}</small></p>
          <div class="admin-actions">
            <button type="button" data-copy="${escapeHtml(item.public_url)}">Copy URL</button>
            <button type="button" data-del-media="${escapeHtml(item.id)}">Delete</button>
          </div>
        </article>`).join('') || '<p class="admin-empty">No media uploaded yet.</p>'}
    </div>`;
  const upload = async (file) => {
    await uploadFile(file, '');
    showToast('Uploaded to the library.', file.name);
    renderMedia();
  };
  document.getElementById('mediaUpload').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await upload(file); } catch (error) { showToast('Upload failed.', error.message); }
  });
  bindDropZone(document.getElementById('mediaDrop'), async (file) => {
    try { await upload(file); } catch (error) { showToast('Upload failed.', error.message); }
  });
  content.querySelectorAll('[data-media-kind]').forEach((button) => button.addEventListener('click', () => {
    state.mediaKind = button.dataset.mediaKind;
    renderMedia();
  }));
  content.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    showToast('URL copied.', 'Paste it into a course field.');
  }));
  content.querySelectorAll('[data-del-media]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this file from the library?')) return;
    await api(`/api/admin/media?id=${encodeURIComponent(button.dataset.delMedia)}`, { method: 'DELETE' });
    renderMedia();
  }));
}

async function renderEnrollments() {
  const [enrollments, courses] = await Promise.all([api('/api/admin/enrollments'), api('/api/admin/courses')]);
  state.enrollments = enrollments.enrollments || [];
  state.courses = courses.courses || [];
  content.innerHTML = `
    <div class="admin-toolbar">
      <div><p class="dashboard-eyebrow">PAYMENTS</p><h1>Who is <em>enrolled.</em></h1></div>
      <div>
        <input id="enrollmentSearch" type="search" placeholder="Search email, course, college, payment id" value="${escapeHtml(state.enrollmentQuery)}" />
        <div class="admin-actions"><button type="button" id="exportEnrollments">Export CSV</button></div>
      </div>
    </div>
    <form class="admin-form admin-panel" id="grantForm">
      <p class="mini-eyebrow">MANUAL ACCESS</p>
      <div class="admin-form-grid">
        <label>Student email<input name="email" type="email" required></label>
        <label>Name<input name="studentName"></label>
        <label>College<input name="college" placeholder="VIT Vellore"></label>
        <label>Course
          <select name="courseId">${state.courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`).join('')}</select>
        </label>
        <label>Student password
          <input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="Optional — lets them sign in">
        </label>
      </div>
      <button class="button button-dark button-sm" type="submit">Grant access</button>
    </form>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Student</th><th>Course</th><th>College</th><th>Payment</th><th></th></tr></thead>
        <tbody>
          ${state.enrollments.filter((row) => `${row.studentEmail} ${row.studentName} ${row.courseName} ${row.college} ${row.razorpayPaymentId}`.toLowerCase().includes(state.enrollmentQuery.toLowerCase())).map((row) => `
            <tr>
              <td>${escapeHtml(row.studentName || row.studentEmail)}<small>${escapeHtml(row.studentEmail)}</small></td>
              <td>${escapeHtml(row.courseName)}</td>
              <td>${escapeHtml(row.college || '—')}</td>
              <td>${escapeHtml(row.razorpayPaymentId || 'comp / manual')}<small>${escapeHtml(row.razorpayOrderId || '')}</small></td>
              <td><button class="admin-inline" type="button" data-revoke="${escapeHtml(row.studentEmail)}" data-course="${escapeHtml(row.courseId)}">Revoke</button></td>
            </tr>`).join('') || '<tr><td colspan="5">No enrollments yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.getElementById('enrollmentSearch')?.addEventListener('input', (event) => {
    state.enrollmentQuery = event.target.value;
    renderEnrollments();
  });
  document.getElementById('exportEnrollments')?.addEventListener('click', () => {
    const header = 'studentName,studentEmail,college,courseName,courseId,paid,razorpayPaymentId,razorpayOrderId,enrolledAt';
    const lines = state.enrollments.map((row) => [row.studentName, row.studentEmail, row.college, row.courseName, row.courseId, row.paid, row.razorpayPaymentId, row.razorpayOrderId, row.enrolledAt].map(csvCell).join(','));
    downloadFile('gradflow-enrollments.csv', [header, ...lines].join('\n'), 'text/csv');
    showToast('Enrollments exported.', `${state.enrollments.length} rows downloaded.`);
  });
  document.getElementById('grantForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    await api('/api/admin/enrollments', {
      method: 'POST',
      body: Object.fromEntries(data.entries()),
    });
    const password = String(data.get('password') || '');
    showToast('Access granted.', password
      ? 'The student can sign in with this email and password.'
      : 'The student can open the course after they sign in or pay.');
    renderEnrollments();
  });
  content.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Revoke this student’s access to the course?')) return;
    await api('/api/admin/enrollments', {
      method: 'DELETE',
      body: { email: button.dataset.revoke, courseId: button.dataset.course },
    });
    showToast('Access revoked.', 'The student must pay again to reopen the course.');
    renderEnrollments();
  }));
}

async function renderStudents() {
  const data = await api('/api/admin/students');
  const rows = (data.students || []).filter((row) => `${row.name} ${row.email} ${row.college}`.toLowerCase().includes(state.studentQuery.toLowerCase()));
  content.innerHTML = `
    <div class="admin-toolbar">
      <div><p class="dashboard-eyebrow">PEOPLE</p><h1>Students in <em>Gradflow.</em></h1></div>
      <input id="studentSearch" type="search" placeholder="Search students" value="${escapeHtml(state.studentQuery)}" />
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Student</th><th>College</th><th>Courses</th><th>Login</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.name)}<small>${escapeHtml(row.email)}</small></td><td>${escapeHtml(row.college || '—')}</td><td>${escapeHtml(row.courses.map((item) => item.courseName).join(', '))}</td><td>${row.hasAccount ? 'Password set' : 'No password yet'}</td></tr>`).join('') || '<tr><td colspan="4">No students yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.getElementById('studentSearch')?.addEventListener('input', (event) => {
    state.studentQuery = event.target.value;
    renderStudents();
  });
}

async function renderColleges() {
  const data = await api('/api/admin/colleges');
  content.innerHTML = `
    <div class="admin-toolbar"><div><p class="dashboard-eyebrow">CAMPUSES</p><h1>College <em>cohorts.</em></h1></div></div>
    <div class="admin-kpis">
      ${(data.colleges || []).map((row) => `<article><small>${escapeHtml(row.college)}</small><strong>${row.students}</strong><p>${row.enrollments} enrollments</p></article>`).join('') || '<p class="admin-empty">No college data yet.</p>'}
    </div>`;
}

async function renderSettings() {
  const data = await api('/api/admin/settings');
  const settings = data.settings || {};
  content.innerHTML = `
    <form class="admin-form" id="settingsForm">
      <div class="admin-toolbar"><div><p class="dashboard-eyebrow">SITE</p><h1>Workspace <em>settings.</em></h1></div></div>
      <label>Support email<input name="supportEmail" type="email" value="${escapeHtml(settings.supportEmail || '')}"></label>
      <label>Checkout display name<input name="checkoutName" value="${escapeHtml(settings.checkoutName || 'Gradflow')}"></label>
      <label class="wide">Announcement banner<input name="announcement" value="${escapeHtml(settings.announcement || '')}" placeholder="Shown on the public landing page"></label>
      <section class="admin-section">
        <p class="mini-eyebrow">REFERRAL PROGRAM</p>
        <h2>Referral <em>operations.</em></h2>
        <p class="admin-builder-copy">Commission is always ${escapeHtml(settings.referralCommissionRateLabel || '20%')} of the actual eligible amount paid. That rate is a fixed backend rule and cannot be changed here. These controls never rewrite historical commissions or course prices.</p>
        <div class="admin-form-grid">
          <label>Referral program enabled
            <select name="referralProgramEnabled">
              <option value="false" ${settings.referralProgramEnabled !== 'true' && settings.referralProgramEnabled !== true ? 'selected' : ''}>No</option>
              <option value="true" ${settings.referralProgramEnabled === 'true' || settings.referralProgramEnabled === true ? 'selected' : ''}>Yes</option>
            </select>
          </label>
          <label>Withdrawals enabled
            <select name="referralWithdrawalEnabled">
              <option value="false" ${settings.referralWithdrawalEnabled !== 'true' && settings.referralWithdrawalEnabled !== true ? 'selected' : ''}>No</option>
              <option value="true" ${settings.referralWithdrawalEnabled === 'true' || settings.referralWithdrawalEnabled === true ? 'selected' : ''}>Yes</option>
            </select>
          </label>
          <label>Default holding days<input name="referralDefaultHoldingDays" type="number" min="0" value="${escapeHtml(settings.referralDefaultHoldingDays ?? 7)}"></label>
          <label>Attribution days<input name="referralAttributionDays" type="number" min="1" value="${escapeHtml(settings.referralAttributionDays ?? 30)}"></label>
          <label>Minimum withdrawal (INR)<input name="referralMinWithdrawalRupees" type="text" inputmode="decimal" value="${escapeHtml(paiseToRupeesField(settings.referralMinWithdrawalPaise))}"></label>
          <label>Maximum withdrawal (INR, 0 = no max)<input name="referralMaxWithdrawalRupees" type="text" inputmode="decimal" value="${escapeHtml(paiseToRupeesField(settings.referralMaxWithdrawalPaise))}"></label>
          <label>Chargeback policy
            <select name="referralChargebackPolicy">
              <option value="FREEZE_THEN_REVERSE" ${settings.referralChargebackPolicy !== 'REVERSE_ON_LOST' ? 'selected' : ''}>Freeze, reverse if lost</option>
              <option value="REVERSE_ON_LOST" ${settings.referralChargebackPolicy === 'REVERSE_ON_LOST' ? 'selected' : ''}>Reverse when lost</option>
            </select>
          </label>
          <label>Referral terms version<input name="referralTermsVersion" value="${escapeHtml(settings.referralTermsVersion || '1')}"></label>
          <label>Fraud review threshold<input name="referralFraudReviewThreshold" type="number" min="1" value="${escapeHtml(settings.referralFraudReviewThreshold ?? 3)}"></label>
          <label>Supported payout methods<input name="referralSupportedPayoutMethods" value="${escapeHtml(settings.referralSupportedPayoutMethods || 'UPI,BANK')}"></label>
        </div>
      </section>
      <button class="button button-lime" type="submit">Save settings</button>
    </form>`;
  document.getElementById('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    await api('/api/admin/settings', { method: 'POST', body: data });
    showToast('Settings saved.', 'These values live in Supabase.');
  });
}

async function renderReferrals() {
  const data = await api('/api/admin/referrals');
  const totals = data.totals || {};
  content.innerHTML = `
    <div class="admin-toolbar">
      <div>
        <p class="dashboard-eyebrow">REFERRALS</p>
        <h1>Direct referral <em>activity.</em></h1>
      </div>
      <div class="admin-actions">
        <button class="button button-dark button-sm" type="button" id="matureNow">Release due commissions</button>
      </div>
    </div>
    <div class="admin-kpis">
      <article><small>SUCCESSFUL REFERRALS</small><strong>${totals.successfulReferrals || 0}</strong></article>
      <article><small>REFERRAL REVENUE</small><strong>${moneyPaise(totals.referralRevenuePaise)}</strong></article>
      <article><small>PENDING</small><strong>${moneyPaise(totals.pending)}</strong></article>
      <article><small>AVAILABLE</small><strong>${moneyPaise(totals.available)}</strong></article>
      <article><small>PAID</small><strong>${moneyPaise(totals.paid)}</strong></article>
      <article><small>REVERSED</small><strong>${moneyPaise(totals.reversed)}</strong></article>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Commission</th><th>People</th><th>Snapshot</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${(data.commissions || []).map((row) => `
            <tr>
              <td>${moneyPaise(row.amountPaise)}<small>${escapeHtml(row.courseId)} · ${escapeHtml(percentFromBps(row.percentBps))}%</small></td>
              <td>${escapeHtml(row.referrer)}<small>referred ${escapeHtml(row.referred)}</small></td>
              <td>Paid ${moneyPaise(row.amountPaidPaise)}<small>List ${moneyPaise(row.listPricePaise)} · rule v${escapeHtml(row.ruleVersion)}</small></td>
              <td>${escapeHtml(row.status)}${row.fraudHold ? '<small>fraud hold</small>' : ''}${row.reviewRequired ? '<small>review</small>' : ''}</td>
              <td>${row.status === 'REVERSED' ? '' : `<button class="admin-inline" data-reverse="${escapeHtml(row.id)}" type="button">Reverse</button>`}</td>
            </tr>
          `).join('') || '<tr><td colspan="5">No commissions yet.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="admin-table-wrap" style="margin-top:18px">
      <table class="admin-table">
        <thead><tr><th>Top direct referrers</th><th>Count</th><th>Commission</th></tr></thead>
        <tbody>
          ${(data.topReferrers || []).map((row) => `<tr><td>${escapeHtml(row.email)}</td><td>${row.count}</td><td>${moneyPaise(row.amountPaise)}</td></tr>`).join('') || '<tr><td colspan="3">No conversions yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.getElementById('matureNow')?.addEventListener('click', async () => {
    await api('/api/admin/referral-mature', { method: 'POST', body: {} });
    showToast('Maturation ran.', 'Eligible pending commissions are now available.');
    renderReferrals();
  });
  content.querySelectorAll('[data-reverse]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Reverse this commission? The original record stays in the ledger.')) return;
      await api('/api/admin/referral-reverse', { method: 'POST', body: { id: button.dataset.reverse } });
      showToast('Commission reversed.', 'A reversal ledger entry was added.');
      renderReferrals();
    });
  });
}

async function renderWithdrawals() {
  const [data, noticeData] = await Promise.all([
    api('/api/admin/referrals'),
    api('/api/admin/referral-notices').catch(() => ({ notices: [] })),
  ]);
  const notices = (noticeData.notices || []).filter((row) => row.status === 'OPEN');
  content.innerHTML = `
    <div class="admin-toolbar"><div><p class="dashboard-eyebrow">PAYOUTS</p><h1>Withdrawal <em>requests.</em></h1></div></div>
    ${notices.length ? `
      <section class="admin-panel">
        <p class="mini-eyebrow">NEW WITHDRAWAL REQUEST</p>
        ${notices.map((row) => `
          <p>
            <strong>${escapeHtml(row.userEmail || '')}</strong>
            <small>${moneyPaise(row.amountPaise)} · ${escapeHtml(row.method || '')} · ${escapeHtml(row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN') : '')}</small>
            <button class="admin-inline" data-open="${escapeHtml(row.withdrawalId)}" data-notice="${escapeHtml(row.id)}" type="button">Open</button>
          </p>
        `).join('')}
      </section>
    ` : ''}
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Student</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${(data.withdrawals || []).map((row) => `
            <tr>
              <td>${escapeHtml(row.user)}<small>${escapeHtml(new Date(row.createdAt).toLocaleString('en-IN'))}</small></td>
              <td>${moneyPaise(row.amountPaise)}</td>
              <td>${escapeHtml(row.method)}</td>
              <td>${escapeHtml(row.status)}</td>
              <td>
                <button class="admin-inline" data-open="${escapeHtml(row.id)}" type="button">View payout</button>
                ${['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(row.status) ? `
                  <button class="admin-inline" data-wd="${escapeHtml(row.id)}" data-status="APPROVED" type="button">Approve</button>
                  <button class="admin-inline" data-wd="${escapeHtml(row.id)}" data-status="REJECTED" type="button">Reject</button>
                ` : ''}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5">No withdrawal requests yet.</td></tr>'}
        </tbody>
      </table>
    </div>
    <section class="admin-panel" id="withdrawalDetail" hidden></section>
    <div class="admin-table-wrap" style="margin-top:18px">
      <table class="admin-table">
        <thead><tr><th>Fraud flags</th><th>Signal</th><th>When</th></tr></thead>
        <tbody>
          ${(data.flags || []).map((row) => `<tr><td>${escapeHtml(row.userEmail || '')}<small>${escapeHtml(row.relatedEmail || '')}</small></td><td>${escapeHtml(row.signal)}</td><td>${escapeHtml(new Date(row.createdAt).toLocaleString('en-IN'))}</td></tr>`).join('') || '<tr><td colspan="3">No flags.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  content.querySelectorAll('[data-wd]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api('/api/admin/referral-withdrawal', {
        method: 'POST',
        body: { id: button.dataset.wd, status: button.dataset.status },
      });
      showToast('Withdrawal updated.', `Status is now ${button.dataset.status}.`);
      renderWithdrawals();
    });
  });
  content.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openWithdrawalDetail(button.dataset.open, button.dataset.notice || ''));
  });
}

async function openWithdrawalDetail(id, noticeId) {
  const query = new URLSearchParams({ id });
  if (noticeId) query.set('noticeId', noticeId);
  const data = await api(`/api/admin/withdrawal?${query}`);
  const panel = document.getElementById('withdrawalDetail');
  if (!panel) return;
  const withdrawal = data.withdrawal || {};
  const payout = data.payout || {};
  const payoutCopy = payout.method === 'UPI'
    ? `<p><strong>${escapeHtml(payout.holderName || withdrawal.userEmail || '')}</strong><small>UPI ${escapeHtml(payout.upiId || '')}</small></p>`
    : `<p><strong>${escapeHtml(payout.holderName || withdrawal.userEmail || '')}</strong><small>${escapeHtml(payout.bankName || '')} · ${escapeHtml(payout.accountNumber || '')} · ${escapeHtml(payout.ifsc || '')}</small></p>`;
  panel.hidden = false;
  panel.innerHTML = `
    <p class="mini-eyebrow">PAYOUT DETAILS</p>
    <h2>Send ${moneyPaise(withdrawal.amountPaise)}</h2>
    ${payoutCopy}
    <p class="admin-empty">${escapeHtml(withdrawal.userEmail || '')} · ${escapeHtml(withdrawal.status || '')} · ${escapeHtml(withdrawal.createdAt ? new Date(withdrawal.createdAt).toLocaleString('en-IN') : '')}</p>
    ${['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(withdrawal.status) ? `
      <form class="admin-form" id="markPaidForm">
        <label>UTR / transaction reference<input name="utr" required value="${escapeHtml(withdrawal.providerReference || '')}"></label>
        <button class="button button-lime button-sm" type="submit">Mark paid</button>
      </form>
    ` : `<p>Reference ${escapeHtml(withdrawal.providerReference || '—')}</p>`}
  `;
  document.getElementById('markPaidForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await api('/api/admin/referral-withdrawal', {
      method: 'POST',
      body: { id: withdrawal.id, status: 'PAID', utr: form.get('utr') },
    });
    showToast('Withdrawal marked paid.', 'The ledger was updated and the student can see Paid status.');
    renderWithdrawals();
  });
}

async function renderAudit() {
  const data = await api('/api/admin/audit');
  content.innerHTML = `
    <div class="admin-toolbar"><div><p class="dashboard-eyebrow">LOG</p><h1>What admins <em>changed.</em></h1></div></div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>
          ${(data.audit || []).map((row) => `<tr><td>${escapeHtml(new Date(row.created_at).toLocaleString('en-IN'))}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.entity || '')} ${escapeHtml(row.entity_id || '')}<small>${escapeHtml(typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail || {}))}</small></td></tr>`).join('') || '<tr><td colspan="3">No activity yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function moveItem(list, index, delta) {
  const next = index + delta;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

function bindDropZone(node, handler) {
  if (!node) return;
  node.addEventListener('dragover', (event) => {
    event.preventDefault();
    node.classList.add('over');
  });
  node.addEventListener('dragleave', () => node.classList.remove('over'));
  node.addEventListener('drop', async (event) => {
    event.preventDefault();
    node.classList.remove('over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await handler(file);
      showToast('File uploaded.', file.name);
    } catch (error) {
      showToast('Upload failed.', error.message);
    }
  });
}

function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

boot();
