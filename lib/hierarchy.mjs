export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function slugify(value, fallback = 'section') {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function uniqueSlug(title, used, fallback = 'section') {
  const taken = used instanceof Set ? used : new Set();
  let base = slugify(title, fallback);
  let slug = base;
  let next = 2;
  while (taken.has(slug)) {
    slug = `${base}-${next}`;
    next += 1;
  }
  taken.add(slug);
  return slug;
}

export function lessonMinutes(lesson = {}) {
  return Math.max(0, Number(lesson.minutes || 0));
}

export function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (!value) return '0 min';
  if (value < 60) return `${value} min`;
  const hours = Math.round((value / 60) * 10) / 10;
  const label = Number.isInteger(hours) ? String(hours) : String(hours);
  return `${label} Hour${hours === 1 ? '' : 's'}`;
}

export function nestHierarchy(sections = [], modules = [], lessons = []) {
  const claimed = new Set();
  const nested = (sections || []).map((section) => {
    const sectionModules = (modules || []).filter((module) => {
      if (section.id && module.sectionId === section.id) {
        claimed.add(module.id);
        return true;
      }
      return false;
    });
    return {
      ...section,
      modules: attachLessons(sectionModules, lessons),
    };
  });
  if (!nested.length) return nested;
  const orphans = (modules || []).filter((module) => !claimed.has(module.id));
  if (orphans.length) {
    nested[0].modules.push(...attachLessons(orphans, lessons));
  }
  const used = new Set(flattenLessons(nested).map((lesson) => lesson.id));
  const leftover = (lessons || []).filter((lesson) => lesson.id && !used.has(lesson.id));
  if (leftover.length && nested[0].modules[0]) {
    nested[0].modules[0].lessons.push(...leftover);
  } else if (leftover.length) {
    nested[0].modules.push({ id: '', title: '', lessons: leftover });
  }
  return nested;
}

function attachLessons(modules = [], lessons = []) {
  return (modules || []).map((module) => ({
    ...module,
    lessons: (lessons || []).filter((lesson) => lesson.moduleId && lesson.moduleId === module.id),
  }));
}

export function flattenLessons(sections = []) {
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

export function publishedSections(sections = [], { includeDrafts = false } = {}) {
  return (sections || []).filter((section) => includeDrafts || section.status === 'published');
}

export function computeProgress(sections = [], completedIds = []) {
  const done = new Set((completedIds || []).map((id) => String(id)));
  const lessons = flattenLessons(sections);
  const total = lessons.length;
  const completed = lessons.filter((lesson) => done.has(String(lesson.id))).length;
  const minutesTotal = lessons.reduce((sum, lesson) => sum + lessonMinutes(lesson), 0);
  const minutesCompleted = lessons
    .filter((lesson) => done.has(String(lesson.id)))
    .reduce((sum, lesson) => sum + lessonMinutes(lesson), 0);

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    completedIds: lessons.filter((lesson) => done.has(String(lesson.id))).map((lesson) => lesson.id),
    minutesCompleted,
    minutesTotal,
    sections: (sections || []).map((section) => {
      const sectionLessons = flattenLessons([section]);
      const sectionTotal = sectionLessons.length;
      const sectionDone = sectionLessons.filter((lesson) => done.has(String(lesson.id))).length;
      return {
        sectionId: section.id,
        slug: section.slug,
        completed: sectionDone,
        total: sectionTotal,
        percent: sectionTotal ? Math.round((sectionDone / sectionTotal) * 100) : 0,
        minutes: sectionLessons.reduce((sum, lesson) => sum + lessonMinutes(lesson), 0),
        modules: (section.modules || []).map((module) => {
          const moduleLessons = module.lessons || [];
          const moduleDone = moduleLessons.filter((lesson) => done.has(String(lesson.id))).length;
          return {
            moduleId: module.id,
            completed: moduleDone,
            total: moduleLessons.length,
            percent: moduleLessons.length ? Math.round((moduleDone / moduleLessons.length) * 100) : 0,
          };
        }),
      };
    }),
  };
}

export function continueTarget(sections = [], completedIds = []) {
  const done = new Set((completedIds || []).map((id) => String(id)));
  const lessons = flattenLessons(sections);
  const next = lessons.find((lesson) => !done.has(String(lesson.id))) || lessons.at(-1) || null;
  const started = lessons.some((lesson) => done.has(String(lesson.id)));
  const allDone = lessons.length > 0 && lessons.every((lesson) => done.has(String(lesson.id)));
  return { lesson: next, started, allDone };
}

export function continueLabel(name, { started = false, allDone = false } = {}) {
  const title = String(name || 'learning').trim() || 'learning';
  if (allDone) return `Review ${title}`;
  if (started) return `Continue ${title}`;
  return `Start ${title}`;
}

export function sectionStats(section = {}) {
  const lessons = flattenLessons([section]);
  const minutes = Number(section.estimatedMinutes) || lessons.reduce((sum, lesson) => sum + lessonMinutes(lesson), 0);
  return {
    moduleCount: (section.modules || []).length,
    lessonCount: lessons.length,
    minutes,
    durationLabel: formatDuration(minutes),
  };
}

export function findSection(sections = [], key) {
  const value = String(key || '');
  return (sections || []).find((section) => section.id === value || section.slug === value) || null;
}

export function findLesson(sections = [], lessonId) {
  return flattenLessons(sections).find((lesson) => String(lesson.id) === String(lessonId)) || null;
}

export function sectionIsVisible(course, lessonId, { includeDrafts = false } = {}) {
  if (!course?.sections?.length) return true;
  const lesson = findLesson(course.sections, lessonId);
  if (!lesson) return false;
  const section = findSection(course.sections, lesson.sectionId);
  if (!section) return false;
  return includeDrafts || section.status === 'published';
}
