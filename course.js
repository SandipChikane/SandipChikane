const params = new URLSearchParams(window.location.search);
let course = window.GradflowEnrollment.courseById(params.get('course'))
  || window.GradflowEnrollment.courseByName(params.get('course'));
let payload = { course: null, progress: null, resume: null, preview: false };
const lockedState = document.getElementById('lockedState');
const unlockedState = document.getElementById('unlockedState');
const missingState = document.getElementById('missingState');
const toast = document.getElementById('courseToast');
const payButton = document.getElementById('payButton');
const payNote = document.getElementById('payNote');
let toastTimer;
let paymentsReady = false;

function showToast(title, detail) {
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = detail;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function setPayBusy(busy, label) {
  if (!payButton) return;
  payButton.disabled = busy || !paymentsReady;
  payButton.textContent = label;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (!value) return '0 min';
  if (value < 60) return `${value} min`;
  const hours = Math.round((value / 60) * 10) / 10;
  return `${hours} Hour${hours === 1 ? '' : 's'}`;
}

function flattenLessons(sections = []) {
  const out = [];
  for (const section of sections || []) {
    for (const module of section.modules || []) {
      for (const lesson of module.lessons || []) {
        out.push({
          ...lesson,
          sectionId: section.id,
          sectionSlug: section.slug,
          sectionTitle: section.title,
          moduleId: module.id,
          moduleTitle: module.title,
        });
      }
    }
  }
  return out;
}

function continueLabel(name, { started = false, allDone = false } = {}) {
  const title = String(name || 'learning').trim() || 'learning';
  if (allDone) return `Review ${title}`;
  if (started) return `Continue ${title}`;
  return `Start ${title}`;
}

function sectionProgress(section) {
  return (payload.progress?.sections || []).find((item) => item.sectionId === section.id || item.slug === section.slug)
    || { completed: 0, total: flattenLessons([section]).length, percent: 0 };
}

function sectionAction(section) {
  const stats = sectionProgress(section);
  return continueLabel(section.title, {
    started: stats.completed > 0,
    allDone: stats.total > 0 && stats.completed >= stats.total,
  });
}

function courseHref(extra = {}) {
  return window.GradflowEnrollment.courseUrl(course.id, extra);
}

function renderUnlocked() {
  document.title = `${course.name} — Gradflow`;
  const workspace = document.getElementById('courseWorkspace');
  const sectionKey = params.get('section') || '';
  const lessonId = params.get('lesson') || '';
  const sections = course.sections || [];
  const section = sections.find((item) => item.slug === sectionKey || item.id === sectionKey) || null;
  const lesson = lessonId
    ? flattenLessons(section ? [section] : sections).find((item) => String(item.id) === String(lessonId))
    : null;

  if (sectionKey && !section) {
    workspace.innerHTML = `
      <p class="course-missing">This learning section is not available.
      <a href="${escapeHtml(courseHref())}">Back to ${escapeHtml(course.name)}</a></p>`;
    lockedState.hidden = true;
    unlockedState.hidden = false;
    missingState.hidden = true;
    return;
  }
  if (lessonId && !lesson) {
    workspace.innerHTML = `
      <p class="course-missing">This lesson is not available.
      <a href="${escapeHtml(section ? courseHref({ section: section.slug }) : courseHref())}">Back</a></p>`;
    lockedState.hidden = true;
    unlockedState.hidden = false;
    missingState.hidden = true;
    return;
  }

  if (lesson) {
    workspace.innerHTML = lessonViewHtml(section || sections.find((item) => item.id === lesson.sectionId), lesson);
  } else if (section) {
    workspace.innerHTML = sectionViewHtml(section);
  } else {
    workspace.innerHTML = courseHomeHtml();
  }

  bindUnlockedActions();
  if (lesson) {
    fillMedia('lessonMedia', lesson.videoUrl, lesson.imageUrl, lesson.allowDownload);
    renderLessonResource(lesson);
  }
  lockedState.hidden = true;
  unlockedState.hidden = false;
  missingState.hidden = true;
}

function overallStats() {
  const lessons = flattenLessons(course.sections || []);
  const minutesTotal = lessons.reduce((sum, lesson) => sum + Math.max(0, Number(lesson.minutes) || 0), 0);
  const progress = payload.progress;
  if (!progress) {
    return { completed: 0, total: lessons.length, percent: 0, minutesTotal, sections: [] };
  }
  return {
    ...progress,
    total: progress.total || lessons.length,
    minutesTotal: progress.minutesTotal || minutesTotal,
  };
}

function progressChip() {
  const progress = overallStats();
  const record = window.GradflowEnrollment.studentEnrollments()[course.id];
  const enrolledOn = record?.enrolledAt
    ? `Enrolled ${new Date(record.enrolledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Sign in on any device';
  return `
    <aside class="enrolled-chip">
      <small>${payload.preview ? 'ADMIN PREVIEW' : 'ACCESS'}</small>
      <strong>${payload.preview ? 'Draft preview' : 'Paid and enrolled'}</strong>
      <span>${escapeHtml(enrolledOn)}</span>
      <span>${progress.completed} / ${progress.total} lessons · ${formatDuration(progress.minutesTotal)}</span>
    </aside>`;
}

function progressBar(percent, label) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="section-progress" role="img" aria-label="${escapeHtml(label || 'Progress')} ${value} percent">
      <div class="section-progress-track"><i style="width:${value}%"></i></div>
      <strong>${value}%</strong>
    </div>`;
}

function courseHomeHtml() {
  const progress = overallStats();
  const resume = payload.resume;
  const continueHref = resume?.lessonId
    ? courseHref({ section: resume.sectionSlug, lesson: resume.lessonId })
    : '';
  const continueText = resume?.label || continueLabel(course.name);
  const sections = course.sections || [];
  return `
    <div class="course-open-hero">
      <div>
        <div class="eyebrow"><span class="spark">✦</span> ${payload.preview ? 'Admin preview' : 'You’re enrolled'}</div>
        <h1>${escapeHtml(course.name)}</h1>
        <p>${escapeHtml(course.blurb || '')}${course.project ? ` Your project: ${escapeHtml(course.project)}.` : ''}</p>
        <div class="course-overall">
          ${progressBar(progress.percent, 'Overall course progress')}
          <p class="course-overall-meta">${progress.completed} of ${progress.total} lessons complete · ${formatDuration(progress.minutesTotal)} total</p>
        </div>
        <div class="hero-actions">
          ${continueHref
            ? `<a class="button button-lime" id="continueCourse" href="${escapeHtml(continueHref)}">${escapeHtml(continueText)} <span>→</span></a>`
            : `<span class="button button-lime" aria-disabled="true">No lessons yet</span>`}
          <a class="arrow-link" href="dashboard.html">Go to learning space <span>↗</span></a>
        </div>
      </div>
      ${progressChip()}
    </div>
    <section class="section-card-wrap">
      <p class="mini-kicker">LEARNING SECTIONS</p>
      <h2>Choose a <em>path.</em></h2>
      <div class="section-card-grid">
        ${sections.map((section) => sectionCardHtml(section)).join('') || '<p class="course-empty">No published learning sections yet.</p>'}
      </div>
    </section>`;
}

function sectionCardHtml(section) {
  const stats = sectionProgress(section);
  const minutes = section.estimatedMinutes || section.minutes || stats.minutes || 0;
  const action = sectionAction(section);
  const resumeLesson = nextLessonInSection(section);
  const href = resumeLesson
    ? courseHref({ section: section.slug, lesson: resumeLesson.id })
    : courseHref({ section: section.slug });
  const thumb = section.thumbnailUrl
    ? `<img src="${escapeHtml(section.thumbnailUrl)}" alt="">`
    : `<span class="section-card-mark">${escapeHtml(section.icon || section.title.slice(0, 1) || '•')}</span>`;
  return `
    <article class="section-card">
      <a class="section-card-media" href="${escapeHtml(courseHref({ section: section.slug }))}">${thumb}</a>
      <div class="section-card-body">
        <h3><a href="${escapeHtml(courseHref({ section: section.slug }))}">${escapeHtml(section.title)}</a></h3>
        <p>${escapeHtml(section.shortDescription || '')}</p>
        <ul class="section-card-meta">
          <li>${section.moduleCount ?? (section.modules || []).length} Modules</li>
          <li>${section.lessonCount ?? flattenLessons([section]).length} Lessons</li>
          <li>${escapeHtml(section.durationLabel || formatDuration(minutes))}</li>
        </ul>
        ${progressBar(stats.percent, section.title)}
        <a class="button button-lime button-sm" href="${escapeHtml(href)}">${escapeHtml(action)} <span>→</span></a>
      </div>
    </article>`;
}

function nextLessonInSection(section) {
  const lessons = flattenLessons([section]);
  const done = completedLessonIds();
  return lessons.find((lesson) => !done.has(String(lesson.id))) || lessons[0] || null;
}

function sectionViewHtml(section) {
  const stats = sectionProgress(section);
  const minutes = section.estimatedMinutes || section.minutes || stats.minutes || 0;
  const resumeLesson = nextLessonInSection(section);
  const action = payload.resume?.sectionId === section.id
    ? (payload.resume.sectionLabel || sectionAction(section))
    : sectionAction(section);
  const href = resumeLesson
    ? courseHref({ section: section.slug, lesson: resumeLesson.id })
    : courseHref({ section: section.slug });
  return `
    <nav class="course-crumb"><a href="${escapeHtml(courseHref())}">${escapeHtml(course.name)}</a><span>/</span><span>${escapeHtml(section.title)}</span></nav>
    <div class="course-open-hero">
      <div>
        <div class="eyebrow"><span class="spark">✦</span> Learning section</div>
        <h1>${escapeHtml(section.title)}</h1>
        <p>${escapeHtml(section.fullDescription || section.shortDescription || '')}</p>
        <div class="course-overall">
          ${progressBar(stats.percent, section.title)}
          <p class="course-overall-meta">${stats.completed} of ${stats.total} lessons · ${escapeHtml(section.durationLabel || formatDuration(minutes))} · ${section.moduleCount ?? (section.modules || []).length} modules</p>
        </div>
        <div class="hero-actions">
          <a class="button button-lime" href="${escapeHtml(href)}">${escapeHtml(action)} <span>→</span></a>
          <a class="arrow-link" href="${escapeHtml(courseHref())}">All sections <span>←</span></a>
        </div>
      </div>
      ${progressChip()}
    </div>
    <section class="section-syllabus">
      ${(section.modules || []).map((module, moduleIndex) => moduleBlockHtml(section, module, moduleIndex)).join('') || '<p class="course-empty">No modules in this section yet.</p>'}
    </section>`;
}

function lessonState(lesson, section) {
  if (completedLessonIds().has(String(lesson.id))) return 'done';
  const next = section ? nextLessonInSection(section) : null;
  if (next && String(next.id) === String(lesson.id)) return 'current';
  if (payload.resume?.lessonId && String(payload.resume.lessonId) === String(lesson.id)) return 'current';
  return 'todo';
}

function completedLessonIds() {
  return new Set((payload.progress?.completedIds || []).map((id) => String(id)));
}

function moduleBlockHtml(section, module, moduleIndex) {
  const lessons = module.lessons || [];
  const done = lessons.filter((lesson) => completedLessonIds().has(String(lesson.id))).length;
  return `
    <article class="module-block">
      <header>
        <p class="mini-kicker">Module ${escapeHtml(module.number || String(moduleIndex + 1))}</p>
        <h2>${escapeHtml(module.title || `Module ${moduleIndex + 1}`)}</h2>
        <small>${done} / ${lessons.length} complete</small>
      </header>
      <ol class="lesson-rail">
        ${lessons.map((lesson) => {
          const state = lessonState(lesson, section);
          const mark = state === 'done' ? '✓' : state === 'current' ? '▶' : '○';
          return `
            <li class="is-${state}">
              <a href="${escapeHtml(courseHref({ section: section.slug, lesson: lesson.id }))}">
                <span class="lesson-mark" aria-hidden="true">${mark}</span>
                <span>${escapeHtml(lesson.title)}</span>
                <small>${lesson.minutes || 0} min</small>
              </a>
            </li>`;
        }).join('')}
      </ol>
    </article>`;
}

function lessonViewHtml(section, lesson) {
  const next = flattenLessons(section ? [section] : course.sections)
    .slice(flattenLessons(section ? [section] : course.sections).findIndex((item) => item.id === lesson.id) + 1)[0];
  return `
    <nav class="course-crumb">
      <a href="${escapeHtml(courseHref())}">${escapeHtml(course.name)}</a>
      ${section ? `<span>/</span><a href="${escapeHtml(courseHref({ section: section.slug }))}">${escapeHtml(section.title)}</a>` : ''}
      <span>/</span><span>${escapeHtml(lesson.title)}</span>
    </nav>
    <div class="course-open-grid">
      <section class="section-syllabus compact-syllabus">
        ${(section?.modules || []).map((module, moduleIndex) => moduleBlockHtml(section, module, moduleIndex)).join('')}
      </section>
      <article class="current-lesson" id="currentLesson">
        <p class="mini-kicker" id="lessonType">${escapeHtml(lesson.type || 'LESSON')}${lesson.moduleTitle ? ` · ${escapeHtml(lesson.moduleTitle)}` : ''}</p>
        <h2 id="lessonTitle">${escapeHtml(lesson.title)}</h2>
        <p id="lessonCopy">${escapeHtml(lesson.copy || '')}</p>
        <div class="course-media" id="lessonMedia" hidden></div>
        <p class="lesson-time" id="lessonTime">${lesson.minutes || 0} min${(course.tools || []).length ? ` · ${escapeHtml(course.tools.join(' · '))}` : ''}</p>
        <div id="lessonResource" hidden></div>
        <div class="lesson-actions">
          <button class="button button-lime" type="button" id="markComplete" data-lesson="${escapeHtml(lesson.id)}">Mark complete <span>✓</span></button>
          ${next ? `<a class="arrow-link" href="${escapeHtml(courseHref({ section: next.sectionSlug, lesson: next.id }))}">Next lesson <span>→</span></a>` : `<a class="arrow-link" href="${escapeHtml(courseHref({ section: section?.slug }))}">Back to section <span>←</span></a>`}
        </div>
      </article>
    </div>`;
}

function bindUnlockedActions() {
  document.getElementById('markComplete')?.addEventListener('click', async (event) => {
    const lessonId = event.currentTarget.dataset.lesson;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await window.GradflowEnrollment.markLessonComplete(course.id, lessonId);
      if (!result.ok) throw new Error(result.data.error || 'Could not save progress.');
      payload.progress = result.data.progress || payload.progress;
      payload.resume = result.data.resume || payload.resume;
      showToast('Progress saved.', 'This lesson is marked complete.');
      params.set('lesson', lessonId);
      if (payload.resume?.sectionSlug) params.set('section', params.get('section') || payload.resume.sectionSlug);
      renderUnlocked();
    } catch (error) {
      showToast('Progress not saved.', error.message);
      button.disabled = false;
    }
  });
}

function renderLocked(config = {}) {
  paymentsReady = Boolean(config.paymentsReady);
  document.title = `Locked · ${course.name} — Gradflow`;
  document.getElementById('lockedTitle').innerHTML = `Unlock <em>${escapeHtml(course.name)}</em>`;
  document.getElementById('lockedBlurb').textContent = `${course.blurb} Enroll to open every published learning section and ${course.project || 'the course project'}.`;
  document.getElementById('lockedPrice').textContent = window.GradflowEnrollment.formatPrice(course.price);
  document.getElementById('lockedMeta').textContent = `${course.weeks} weeks · ${(course.tools || []).join(' · ')}`;
  fillMedia('lockedMedia', course.promoVideoUrl, course.coverImageUrl || course.thumbnailUrl);
  const list = document.getElementById('lockedSections');
  if (list) {
    const sections = course.sections || [];
    list.replaceChildren();
    sections.forEach((section) => {
      const item = document.createElement('li');
      item.textContent = section.title;
      list.appendChild(item);
    });
    list.hidden = sections.length === 0;
  }
  const email = window.GradflowEnrollment.getStudentEmail();
  const college = window.GradflowEnrollment.getStudentCollege();
  if (email) {
    document.getElementById('enrollEmail').value = email;
    const signInEmail = document.getElementById('signInEmail');
    if (signInEmail) signInEmail.value = email;
  }
  if (college) document.getElementById('enrollCollege').value = college;
  if (paymentsReady) {
    payNote.textContent = `${config.mode === 'test' ? 'Razorpay test mode. ' : ''}Checkout opens with Razorpay. Card details stay with Razorpay. TPOs never see payment data.`;
    setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
  } else {
    payNote.textContent = 'Supabase and Razorpay keys are not connected yet. The course stays locked until payment can be verified. TPOs never see payment data.';
    setPayBusy(true, 'Payments not connected yet');
  }
  lockedState.hidden = false;
  unlockedState.hidden = true;
  missingState.hidden = true;
}

async function finishEnrollment(record) {
  window.GradflowEnrollment.cacheEnrollment(record);
  await hydrateCourse();
  renderUnlocked();
  showToast('Payment verified.', `${course.name} is unlocked. TPOs never see this payment.`);
  unlockedState.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function protectMedia(element, allowDownload = false) {
  if (!element) return element;
  element.controlsList = allowDownload ? 'noremoteplayback' : 'nodownload noremoteplayback';
  element.disablePictureInPicture = true;
  element.setAttribute('controlsList', element.controlsList);
  element.setAttribute('disablePictureInPicture', '');
  element.setAttribute('controlslist', element.controlsList);
  element.draggable = false;
  if (!allowDownload) {
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.addEventListener('dragstart', (event) => event.preventDefault());
  }
  return element;
}

function withDownloadParam(url) {
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set('download', '1');
  return `${parsed.pathname}${parsed.search}`;
}

function downloadLink(url, label) {
  const link = document.createElement('a');
  link.className = 'arrow-link';
  link.href = withDownloadParam(url);
  link.textContent = `${label} →`;
  return link;
}

function renderLessonResource(lesson = {}) {
  const resource = document.getElementById('lessonResource');
  if (!resource) return;
  resource.replaceChildren();
  if (lesson.resourceUrl) {
    const card = document.createElement('div');
    card.className = lesson.allowDownload ? 'resource-card downloads-on' : 'resource-card';
    if (lesson.resourceViewable !== false) {
      const button = document.createElement('button');
      button.className = 'arrow-link';
      button.type = 'button';
      button.textContent = `${lesson.resourceLabel || 'Open resource'} →`;
      const frame = document.createElement('div');
      frame.className = lesson.allowDownload ? 'resource-frame downloads-on' : 'resource-frame';
      frame.hidden = true;
      button.addEventListener('click', () => openProtectedResource(frame, lesson.resourceUrl, lesson.allowDownload));
      card.append(button, frame);
    }
    if (lesson.allowDownload) {
      card.appendChild(downloadLink(lesson.resourceUrl, 'Download resource'));
    }
    const note = document.createElement('p');
    note.className = 'resource-note';
    note.textContent = lesson.allowDownload
      ? 'You can save this file. Admin enabled downloads for this lesson.'
      : 'View in the browser. Downloads are turned off.';
    card.appendChild(note);
    resource.appendChild(card);
    resource.hidden = false;
    return;
  }
  if (lesson.resourceBlocked) {
    const note = document.createElement('p');
    note.className = 'resource-note';
    note.textContent = 'This file stays in the lesson player and cannot be downloaded.';
    resource.appendChild(note);
    resource.hidden = false;
    return;
  }
  resource.hidden = true;
}

function openProtectedResource(frame, url, allowDownload = false) {
  frame.hidden = false;
  frame.replaceChildren();
  if (allowDownload) frame.classList.add('downloads-on');
  const kind = new URL(url, window.location.origin).searchParams.get('kind');
  if (kind === 'image' || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)) {
    const image = protectMedia(document.createElement('img'), allowDownload);
    image.src = url;
    image.alt = 'Lesson resource';
    frame.appendChild(image);
    return;
  }
  if (kind === 'video' || /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url)) {
    const video = protectMedia(document.createElement('video'), allowDownload);
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    frame.appendChild(video);
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = 'Lesson resource';
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  if (!allowDownload) iframe.addEventListener('contextmenu', (event) => event.preventDefault());
  frame.appendChild(iframe);
}

function fillMedia(id, videoUrl, imageUrl, allowDownload = false) {
  const node = document.getElementById(id);
  if (!node) return;
  node.replaceChildren();
  node.classList.toggle('downloads-on', Boolean(allowDownload));
  if (videoUrl) {
    const video = protectMedia(document.createElement('video'), allowDownload);
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    node.appendChild(video);
    if (allowDownload) node.appendChild(downloadLink(videoUrl, 'Download video'));
    node.hidden = false;
    return;
  }
  if (imageUrl) {
    const image = protectMedia(document.createElement('img'), allowDownload);
    image.src = imageUrl;
    image.alt = '';
    node.appendChild(image);
    if (allowDownload) node.appendChild(downloadLink(imageUrl, 'Download image'));
    node.hidden = false;
    return;
  }
  node.hidden = true;
}

async function hydrateCourse() {
  const id = params.get('course') || course?.id;
  if (!id) return null;
  const detail = await window.GradflowEnrollment.loadStudentCourse(id, {
    preview: params.get('preview') === '1',
    section: params.get('section') || '',
  });
  if (!detail?.course) return detail;
  course = detail.course;
  payload = detail;
  return detail;
}

async function boot() {
  await window.GradflowEnrollment.loadPublishedCatalog();
  course = window.GradflowEnrollment.courseById(params.get('course'))
    || window.GradflowEnrollment.courseByName(params.get('course'));
  if (params.get('preview') === '1' && params.get('course')) {
    const detail = await hydrateCourse();
    if (!detail?.course) {
      missingState.hidden = false;
      lockedState.hidden = true;
      unlockedState.hidden = true;
      return;
    }
  }
  if (!course) {
    missingState.hidden = false;
    lockedState.hidden = true;
    unlockedState.hidden = true;
    return;
  }

  const [config] = await Promise.all([
    window.GradflowEnrollment.publicConfig(),
    window.GradflowEnrollment.refreshFromServer(),
  ]);

  if (params.get('preview') === '1') {
    await hydrateCourse();
    renderUnlocked();
    showToast('Admin preview.', 'Draft courses stay hidden from students until you publish.');
    return;
  }
  if (window.GradflowEnrollment.isEnrolled(course.id)) {
    const detail = await hydrateCourse();
    if (!detail?.course && params.get('section')) {
      missingState.hidden = false;
      missingState.innerHTML = `This learning section is not available. <a href="${escapeHtml(window.GradflowEnrollment.courseUrl(course.id))}">Back to the course</a>`;
      lockedState.hidden = true;
      unlockedState.hidden = true;
      return;
    }
    renderUnlocked();
    return;
  }
  renderLocked(config);
}

document.getElementById('enrollForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!course || !paymentsReady) return;

  const email = document.getElementById('enrollEmail').value.trim();
  const college = document.getElementById('enrollCollege').value.trim();
  const password = document.getElementById('enrollPassword').value;
  const passwordConfirm = document.getElementById('enrollPasswordConfirm').value;
  if (!email || !college) return;
  if (password !== passwordConfirm) {
    showToast('Passwords do not match.', 'Use the same password in both fields so you can sign in later.');
    return;
  }

  window.GradflowEnrollment.setStudentEmail(email);
  window.GradflowEnrollment.setStudentCollege(college);
  setPayBusy(true, 'Creating Razorpay order…');

  try {
    const orderResult = await window.GradflowEnrollment.createOrder({
      courseId: course.id,
      email,
      college,
      password,
    });

    if (orderResult.data.alreadyEnrolled && orderResult.data.enrollment?.paid) {
      await finishEnrollment(orderResult.data.enrollment);
      return;
    }
    if (orderResult.status === 409) {
      throw new Error(orderResult.data.error || 'You already bought this course. Sign in below.');
    }
    if (!orderResult.ok) {
      throw new Error(orderResult.data.error || 'Could not create a Razorpay order.');
    }

    const RazorpayCheckout = await window.GradflowEnrollment.loadRazorpay();
    const checkout = new RazorpayCheckout({
      key: orderResult.data.keyId,
      amount: orderResult.data.amount,
      currency: orderResult.data.currency,
      name: orderResult.data.checkoutName || 'Gradflow',
      description: course.name,
      order_id: orderResult.data.orderId,
      prefill: { email },
      notes: { courseId: course.id, college },
      theme: { color: '#0b2923' },
      handler: async (response) => {
        setPayBusy(true, 'Verifying payment…');
        try {
          const verifyResult = await window.GradflowEnrollment.verifyPayment({
            email,
            college,
            password,
            courseId: course.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (!verifyResult.ok || !verifyResult.data.enrollment?.paid) {
            throw new Error(verifyResult.data.error || 'Payment could not be verified.');
          }
          await finishEnrollment(verifyResult.data.enrollment);
        } catch (error) {
          setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
          showToast('Payment not verified.', error.message);
        }
      },
      modal: {
        ondismiss: () => {
          setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
          showToast('Checkout closed.', 'No enrollment was saved because payment was not completed.');
        },
      },
    });
    checkout.open();
  } catch (error) {
    setPayBusy(false, `Pay ${window.GradflowEnrollment.formatPrice(course.price)} and enroll`);
    showToast('Payment could not start.', error.message);
  }
});

document.getElementById('signInForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('signInEmail').value.trim();
  const password = document.getElementById('signInPassword').value;
  const button = document.getElementById('signInButton');
  if (button) button.disabled = true;
  try {
    const result = await window.GradflowEnrollment.studentLogin({ email, password });
    if (!result.ok) {
      throw new Error(result.data.error || 'Could not sign in.');
    }
    if (window.GradflowEnrollment.isEnrolled(course.id)) {
      await hydrateCourse();
      renderUnlocked();
      showToast('Signed in.', `${course.name} is unlocked on this device.`);
      document.getElementById('unlockedState').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    showToast('Signed in.', 'This email does not have this course yet. Pay below to enroll.');
  } catch (error) {
    showToast('Could not sign in.', error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

document.addEventListener('contextmenu', (event) => {
  const media = event.target.closest('.course-media, .resource-frame, .current-lesson video, .current-lesson img');
  if (media && !media.closest('.downloads-on') && !media.classList.contains('downloads-on')) {
    event.preventDefault();
  }
});

boot();
