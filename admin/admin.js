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
  await api('/api/admin/logout', { method: 'POST', body: {} });
  state.session = null;
  showLogin();
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
          <button type="button" id="seedCatalog">Seed built-in courses</button>
          <a href="#courses">Open course list</a>
        </div>
      </section>
    </div>`;
  document.getElementById('seedCatalog')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/admin/seed', { method: 'POST', body: {} });
      showToast(result.seeded ? 'Missing courses seeded.' : 'Built-in catalog already present.', `${result.added || 0} added · ${result.count} total.`);
      await renderOverview();
    } catch (error) {
      showToast('Seed failed.', error.message);
    }
  });
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
    modules: [{ number: '01', title: '', time: '', description: '' }],
    lessons: [{ title: '', type: 'LESSON', minutes: 30, copy: '', isCurrent: true, moduleIndex: 0 }],
    lesson: {},
  };
}

async function renderEditor(id) {
  if (id === 'new') {
    state.editor = blankCourse();
  } else {
    const data = await api(`/api/admin/course?id=${encodeURIComponent(id)}`);
    state.editor = data.course;
    if (!state.editor.modules?.length) state.editor.modules = [{ number: '01', title: '', time: '' }];
    if (!state.editor.lessons?.length) {
      state.editor.lessons = [{
        ...(state.editor.lesson || {}),
        isCurrent: true,
        moduleIndex: 0,
      }];
    }
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
        <p class="mini-eyebrow">SYLLABUS</p>
        <h2>Modules students <em>unlock.</em></h2>
        <div id="moduleList">${course.modules.map((module, index) => moduleFields(module, index)).join('')}</div>
        <button class="admin-inline" type="button" id="addModule">Add module</button>
      </section>

      <section class="admin-section">
        <p class="mini-eyebrow">LESSONS</p>
        <h2>Videos, copy, <em>resources.</em></h2>
        <div id="lessonList">${course.lessons.map((lesson, index) => lessonFields(lesson, index, course.modules.length)).join('')}</div>
        <button class="admin-inline" type="button" id="addLesson">Add lesson</button>
      </section>
    </form>`;

  document.getElementById('courseForm').addEventListener('submit', saveEditor);
  document.getElementById('courseForm').addEventListener('input', () => { state.dirty = true; });
  document.getElementById('publishNow').addEventListener('click', async (event) => {
    event.preventDefault();
    await persistEditor({ publish: true });
  });
  document.getElementById('addModule').addEventListener('click', () => {
    syncEditorForm();
    state.editor.modules.push({ number: String(state.editor.modules.length + 1).padStart(2, '0'), title: '', time: '' });
    state.dirty = true;
    paintEditor();
  });
  document.getElementById('addLesson').addEventListener('click', () => {
    syncEditorForm();
    state.editor.lessons.push({ title: '', type: 'LESSON', minutes: 20, copy: '', moduleIndex: 0 });
    state.dirty = true;
    paintEditor();
  });
  content.querySelectorAll('[data-remove-module]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const index = Number(button.dataset.removeModule);
    if (state.editor.modules.length <= 1) return;
    state.editor.modules.splice(index, 1);
    state.editor.lessons.forEach((lesson) => {
      if (lesson.moduleIndex > index) lesson.moduleIndex -= 1;
      if (lesson.moduleIndex === index) lesson.moduleIndex = Math.max(0, index - 1);
    });
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-move-module]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const [index, delta] = button.dataset.moveModule.split(':').map(Number);
    moveItem(state.editor.modules, index, delta);
    state.editor.lessons.forEach((lesson) => {
      if (lesson.moduleIndex === index) lesson.moduleIndex = index + delta;
      else if (lesson.moduleIndex === index + delta) lesson.moduleIndex = index;
    });
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-remove-lesson]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const index = Number(button.dataset.removeLesson);
    if (state.editor.lessons.length <= 1) return;
    state.editor.lessons.splice(index, 1);
    state.dirty = true;
    paintEditor();
  }));
  content.querySelectorAll('[data-move-lesson]').forEach((button) => button.addEventListener('click', () => {
    syncEditorForm();
    const [index, delta] = button.dataset.moveLesson.split(':').map(Number);
    moveItem(state.editor.lessons, index, delta);
    state.dirty = true;
    paintEditor();
  }));
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
  content.querySelectorAll('[data-lesson-upload]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const [index, field] = input.dataset.lessonUpload.split(':');
      try {
        const url = await uploadFile(file, state.editor.id || 'drafts');
        syncEditorForm();
        state.editor.lessons[Number(index)][field] = url;
        state.dirty = true;
        paintEditor();
        showToast('Lesson file uploaded.', file.name);
      } catch (error) {
        showToast('Upload failed.', error.message);
      }
    });
  });
}

function moduleFields(module, index) {
  return `
    <div class="admin-module">
      <div class="admin-row-tools">
        <button type="button" data-move-module="${index}:-1">Up</button>
        <button type="button" data-move-module="${index}:1">Down</button>
        <button type="button" data-remove-module="${index}">Remove</button>
      </div>
      <label>Number<input name="module-number-${index}" value="${escapeHtml(module.number || '')}"></label>
      <label>Title<input name="module-title-${index}" value="${escapeHtml(module.title || '')}"></label>
      <label>Duration<input name="module-time-${index}" value="${escapeHtml(module.time || module.duration || '')}"></label>
      <label>Description<textarea name="module-description-${index}">${escapeHtml(module.description || '')}</textarea></label>
    </div>`;
}

function lessonFields(lesson, index, moduleCount) {
  const options = Array.from({ length: moduleCount || 1 }, (_, moduleIndex) => {
    const selected = Number(lesson.moduleIndex ?? 0) === moduleIndex ? 'selected' : '';
    return `<option value="${moduleIndex}" ${selected}>Module ${moduleIndex + 1}</option>`;
  }).join('');
  return `
    <div class="admin-lesson">
      <div class="admin-row-tools">
        <button type="button" data-move-lesson="${index}:-1">Up</button>
        <button type="button" data-move-lesson="${index}:1">Down</button>
        <button type="button" data-remove-lesson="${index}">Remove</button>
      </div>
      <label>Title<input name="lesson-title-${index}" value="${escapeHtml(lesson.title || '')}"></label>
      <label>Type<input name="lesson-type-${index}" value="${escapeHtml(lesson.type || 'LESSON')}"></label>
      <label>Minutes<input name="lesson-minutes-${index}" type="number" value="${escapeHtml(lesson.minutes || 0)}"></label>
      <label>Module<select name="lesson-module-${index}">${options}</select></label>
      <label>Current lesson
        <select name="lesson-current-${index}">
          <option value="false" ${!lesson.isCurrent ? 'selected' : ''}>No</option>
          <option value="true" ${lesson.isCurrent ? 'selected' : ''}>Yes</option>
        </select>
      </label>
      <label>Copy<textarea name="lesson-copy-${index}">${escapeHtml(lesson.copy || '')}</textarea></label>
      <label>Video URL<input name="lesson-video-${index}" value="${escapeHtml(lesson.videoUrl || '')}"></label>
      <label class="admin-drop">Upload lesson video<input type="file" accept="video/*" data-lesson-upload="${index}:videoUrl"></label>
      <label>Image URL<input name="lesson-image-${index}" value="${escapeHtml(lesson.imageUrl || '')}"></label>
      <label class="admin-drop">Upload lesson image<input type="file" accept="image/*" data-lesson-upload="${index}:imageUrl"></label>
      <label>Resource URL<input name="lesson-resource-${index}" value="${escapeHtml(lesson.resourceUrl || '')}"></label>
      <label>Resource label<input name="lesson-resource-label-${index}" value="${escapeHtml(lesson.resourceLabel || '')}"></label>
      ${lesson.videoUrl ? `<div class="admin-preview"><video src="${escapeHtml(lesson.videoUrl)}" controls></video></div>` : ''}
    </div>`;
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
  course.modules = course.modules.map((module, index) => ({
    ...module,
    number: String(data.get(`module-number-${index}`) || ''),
    title: String(data.get(`module-title-${index}`) || ''),
    time: String(data.get(`module-time-${index}`) || ''),
    description: String(data.get(`module-description-${index}`) || ''),
  }));
  course.lessons = course.lessons.map((lesson, index) => ({
    ...lesson,
    title: String(data.get(`lesson-title-${index}`) || ''),
    type: String(data.get(`lesson-type-${index}`) || 'LESSON'),
    minutes: Number(data.get(`lesson-minutes-${index}`) || 0),
    moduleIndex: Number(data.get(`lesson-module-${index}`) || 0),
    isCurrent: data.get(`lesson-current-${index}`) === 'true',
    copy: String(data.get(`lesson-copy-${index}`) || ''),
    videoUrl: String(data.get(`lesson-video-${index}`) || lesson.videoUrl || ''),
    imageUrl: String(data.get(`lesson-image-${index}`) || lesson.imageUrl || ''),
    resourceUrl: String(data.get(`lesson-resource-${index}`) || ''),
    resourceLabel: String(data.get(`lesson-resource-label-${index}`) || ''),
  }));
  const current = course.lessons.find((lesson) => lesson.isCurrent) || course.lessons[0];
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
      <button class="button button-lime" type="submit">Save settings</button>
    </form>`;
  document.getElementById('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    await api('/api/admin/settings', { method: 'POST', body: data });
    showToast('Settings saved.', 'These values live in Supabase.');
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
