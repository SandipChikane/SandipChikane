import { SEED_COURSES } from './seed-courses.mjs';
import {
  isUuid,
  nestHierarchy,
  publishedSections,
  sectionStats,
  uniqueSlug,
} from './hierarchy.mjs';
import { stripProtectedMedia, withStudentMediaProxy } from './student-media.mjs';

const COURSE_COLUMNS = 'id,name,category,weeks,price,blurb,tools,project,cover_image_url,thumbnail_url,promo_video_url,lesson,status,featured,sort_order,seo_title,seo_description,created_at,updated_at';

function mapLesson(lesson = {}) {
  return {
    id: lesson.id || '',
    moduleId: lesson.module_id || lesson.moduleId || '',
    sectionId: lesson.section_id || lesson.sectionId || '',
    number: lesson.number || '',
    type: lesson.type || 'LESSON',
    title: lesson.title,
    minutes: Number(lesson.minutes) || 0,
    copy: lesson.copy || '',
    videoUrl: lesson.video_url || lesson.videoUrl || '',
    imageUrl: lesson.image_url || lesson.imageUrl || '',
    resourceUrl: lesson.resource_url || lesson.resourceUrl || '',
    resourceLabel: lesson.resource_label || lesson.resourceLabel || '',
    isCurrent: Boolean(lesson.is_current || lesson.isCurrent),
  };
}

function mapModule(module = {}) {
  return {
    id: module.id || '',
    sectionId: module.section_id || module.sectionId || '',
    number: module.number || '',
    title: module.title,
    time: module.duration || module.time || '',
    description: module.description || '',
  };
}

function mapSection(section = {}) {
  return {
    id: section.id || '',
    courseId: section.course_id || section.courseId || '',
    title: section.title || '',
    slug: section.slug || '',
    shortDescription: section.short_description || section.shortDescription || '',
    fullDescription: section.full_description || section.fullDescription || '',
    thumbnailUrl: section.thumbnail_url || section.thumbnailUrl || '',
    icon: section.icon || '',
    sortOrder: Number(section.sort_order ?? section.sortOrder) || 0,
    status: section.status === 'published' ? 'published' : 'draft',
    estimatedMinutes: Number(section.estimated_minutes ?? section.estimatedMinutes) || 0,
    prerequisiteIds: Array.isArray(section.prerequisite_section_ids)
      ? section.prerequisite_section_ids
      : (section.prerequisiteIds || []),
    createdAt: section.created_at || section.createdAt || '',
    updatedAt: section.updated_at || section.updatedAt || '',
    modules: [],
  };
}

export function mapCourseRecord(row, modules = [], lessons = [], sections = []) {
  if (!row) return null;
  const mappedModules = modules.map((module) => mapModule(module));
  const mappedLessons = lessons.map((lesson) => mapLesson(lesson));
  const mappedSections = sections.map((section) => mapSection(section));
  if (!mappedSections.length && (mappedModules.length || mappedLessons.length)) {
    mappedSections.push({
      id: '',
      courseId: row.id,
      title: row.name,
      slug: 'course-path',
      shortDescription: row.blurb || '',
      fullDescription: '',
      thumbnailUrl: row.cover_image_url || row.thumbnail_url || '',
      icon: '',
      sortOrder: 0,
      status: 'published',
      estimatedMinutes: 0,
      prerequisiteIds: [],
      createdAt: '',
      updatedAt: '',
      modules: [],
    });
  }
  const nested = nestHierarchy(mappedSections, mappedModules, mappedLessons);
  const decorated = nested.map((section) => ({ ...section, ...sectionStats(section) }));
  const current = mappedLessons.find((lesson) => lesson.isCurrent) || mappedLessons[0] || row.lesson || {};
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    weeks: Number(row.weeks) || 0,
    price: Number(row.price) || 0,
    blurb: row.blurb || '',
    tools: Array.isArray(row.tools) ? row.tools : [],
    project: row.project || '',
    coverImageUrl: row.cover_image_url || '',
    thumbnailUrl: row.thumbnail_url || '',
    promoVideoUrl: row.promo_video_url || '',
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order) || 0,
    sections: decorated,
    modules: mappedModules,
    lessons: mappedLessons,
    lesson: mapLesson(current),
  };
}

export function toPublicCourse(row, modules = [], lessons = [], sections = []) {
  const course = stripProtectedMedia(mapCourseRecord(row, modules, lessons, sections));
  if (!course) return course;
  return {
    ...course,
    sections: publishedSections(course.sections).map((section) => ({
      id: section.id,
      title: section.title,
      slug: section.slug,
      shortDescription: section.shortDescription,
      thumbnailUrl: section.thumbnailUrl,
      icon: section.icon,
      status: section.status,
      durationLabel: section.durationLabel,
      moduleCount: section.moduleCount,
      lessonCount: section.lessonCount,
      estimatedMinutes: section.estimatedMinutes || section.minutes,
    })),
    modules: course.modules.map((module) => ({ id: module.id, title: module.title, time: module.time, number: module.number })),
    lessons: [],
    lesson: { ...course.lesson, videoUrl: '', imageUrl: '', resourceUrl: '' },
  };
}

export function toStudentCourse(row, modules = [], lessons = [], sections = []) {
  const course = withStudentMediaProxy(mapCourseRecord(row, modules, lessons, sections));
  if (!course) return course;
  return {
    ...course,
    sections: publishedSections(course.sections),
  };
}

export function toPreviewCourse(row, modules = [], lessons = [], sections = []) {
  return withStudentMediaProxy(mapCourseRecord(row, modules, lessons, sections));
}

export function toAdminCourse(row, modules = [], lessons = [], sections = []) {
  const course = mapCourseRecord(row, modules, lessons, sections);
  return {
    ...course,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromHydrated(hydrated, view = 'admin') {
  if (!hydrated?.row) return null;
  const args = [hydrated.row, hydrated.modules || [], hydrated.lessons || [], hydrated.sections || []];
  if (view === 'public') return toPublicCourse(...args);
  if (view === 'student') return toStudentCourse(...args);
  if (view === 'preview') return toPreviewCourse(...args);
  return toAdminCourse(...args);
}

export function normalizeSavePayload(input = {}) {
  const course = { ...input };
  let sections = Array.isArray(input.sections) ? input.sections.map((section) => ({ ...section })) : [];
  if (!sections.length && (input.modules?.length || input.lessons?.length)) {
    const modules = (input.modules || []).map((module, index) => ({
      ...module,
      lessons: (input.lessons || []).filter((lesson) => Number(lesson.moduleIndex ?? 0) === index || lesson.moduleId === module.id),
    }));
    sections = [{
      title: input.name || 'Course path',
      slug: 'course-path',
      shortDescription: input.blurb || '',
      status: 'published',
      modules,
    }];
  }
  const used = new Set();
  course.sections = sections.map((section, sectionIndex) => {
    const slug = uniqueSlug(section.slug || section.title || `section-${sectionIndex + 1}`, used);
    const modules = Array.isArray(section.modules) && section.modules.length
      ? section.modules
      : (input.modules || []).filter((module) => module.sectionId === section.id || Number(module.sectionIndex ?? -1) === sectionIndex);
    return {
      ...section,
      slug,
      status: section.status === 'published' ? 'published' : 'draft',
      modules: modules.map((module, moduleIndex) => ({
        ...module,
        lessons: Array.isArray(module.lessons) && module.lessons.length
          ? module.lessons
          : (input.lessons || []).filter((lesson) => lesson.moduleId === module.id || (lesson.sectionIndex === sectionIndex && Number(lesson.moduleIndex ?? 0) === moduleIndex)),
      })),
    };
  });
  return course;
}

export function createCms({ supabaseRequest }) {
  async function listCourses() {
    return supabaseRequest(`courses?select=${COURSE_COLUMNS}&order=sort_order.asc,created_at.desc`);
  }

  async function getCourseRow(id) {
    const rows = await supabaseRequest(`courses?id=eq.${encodeURIComponent(id)}&select=${COURSE_COLUMNS}&limit=1`);
    return rows?.[0] || null;
  }

  async function sectionsFor(courseId) {
    try {
      return await supabaseRequest(`course_sections?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=sort_order.asc`);
    } catch {
      return [];
    }
  }

  async function modulesFor(courseId) {
    return supabaseRequest(`course_modules?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=sort_order.asc`);
  }

  async function lessonsFor(courseId) {
    return supabaseRequest(`course_lessons?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=sort_order.asc`);
  }

  async function hydrate(row) {
    if (!row) return null;
    const [sections, modules, lessons] = await Promise.all([
      sectionsFor(row.id),
      modulesFor(row.id),
      lessonsFor(row.id),
    ]);
    return { row, sections: sections || [], modules: modules || [], lessons: lessons || [] };
  }

  async function existingIds(table, courseId) {
    const rows = await supabaseRequest(`${table}?course_id=eq.${encodeURIComponent(courseId)}&select=id`);
    return new Set((rows || []).map((row) => row.id));
  }

  async function deleteMissing(table, courseId, keep) {
    const existing = await existingIds(table, courseId);
    const remove = [...existing].filter((id) => !keep.has(id));
    if (!remove.length) return;
    const filter = remove.map((id) => `"${id}"`).join(',');
    await supabaseRequest(`${table}?id=in.(${filter})`, { method: 'DELETE' });
  }

  async function upsertRow(table, body, existingId) {
    if (existingId && isUuid(existingId)) {
      const rows = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body,
      });
      const saved = Array.isArray(rows) ? rows[0] : rows;
      if (saved?.id) return saved;
    }
    const rows = await supabaseRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body,
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function syncLessonContent(lessonId, lesson) {
    try {
      await supabaseRequest(`lesson_content?lesson_id=eq.${encodeURIComponent(lessonId)}`, { method: 'DELETE' });
      const blocks = [];
      if (lesson.copy) blocks.push({ kind: 'copy', body: lesson.copy, sort_order: blocks.length });
      if (lesson.videoUrl) blocks.push({ kind: 'video', media_url: lesson.videoUrl, sort_order: blocks.length });
      if (lesson.imageUrl) blocks.push({ kind: 'image', media_url: lesson.imageUrl, sort_order: blocks.length });
      if (lesson.resourceUrl) {
        blocks.push({
          kind: 'resource',
          body: lesson.resourceLabel || '',
          media_url: lesson.resourceUrl,
          sort_order: blocks.length,
        });
      }
      for (const block of blocks) {
        await supabaseRequest('lesson_content', {
          method: 'POST',
          body: { lesson_id: lessonId, ...block },
        });
      }
    } catch {
      // lesson_content is future-facing; lesson columns remain the source of truth.
    }
  }

  return {
    listCourses,

    async listPublished() {
      return supabaseRequest(`courses?status=eq.published&select=${COURSE_COLUMNS}&order=sort_order.asc,created_at.desc`);
    },

    async getHydrated(id) {
      return hydrate(await getCourseRow(id));
    },

    async saveCourse(input) {
      const payload = normalizeSavePayload(input);
      const id = String(payload.id || '').trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(id)) {
        const error = new Error('Course id must be lowercase letters, numbers, and hyphens.');
        error.status = 400;
        throw error;
      }
      const now = new Date().toISOString();
      const course = {
        id,
        name: String(payload.name || '').trim(),
        category: String(payload.category || 'analytics').trim(),
        weeks: Number(payload.weeks) || 8,
        price: Number(payload.price) || 0,
        blurb: String(payload.blurb || '').trim(),
        tools: Array.isArray(payload.tools) ? payload.tools.map((tool) => String(tool).trim()).filter(Boolean) : [],
        project: String(payload.project || '').trim(),
        cover_image_url: String(payload.coverImageUrl || '').trim() || null,
        thumbnail_url: String(payload.thumbnailUrl || '').trim() || null,
        promo_video_url: String(payload.promoVideoUrl || '').trim() || null,
        lesson: payload.lesson || null,
        status: ['draft', 'published', 'archived'].includes(payload.status) ? payload.status : 'draft',
        featured: Boolean(payload.featured),
        sort_order: Number(payload.sortOrder) || 0,
        seo_title: String(payload.seoTitle || '').trim() || null,
        seo_description: String(payload.seoDescription || '').trim() || null,
        updated_at: now,
      };
      if (!course.name) {
        const error = new Error('Course title is required.');
        error.status = 400;
        throw error;
      }

      await supabaseRequest('courses?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: course,
      });

      const keepSections = new Set();
      const keepModules = new Set();
      const keepLessons = new Set();
      let firstLesson = null;

      for (const [sectionIndex, section] of payload.sections.entries()) {
        const savedSection = await upsertRow('course_sections', {
          course_id: id,
          title: section.title || `Section ${sectionIndex + 1}`,
          slug: section.slug,
          short_description: section.shortDescription || '',
          full_description: section.fullDescription || '',
          thumbnail_url: section.thumbnailUrl || null,
          icon: section.icon || '',
          sort_order: sectionIndex,
          status: section.status === 'published' ? 'published' : 'draft',
          estimated_minutes: Number(section.estimatedMinutes) || 0,
          prerequisite_section_ids: Array.isArray(section.prerequisiteIds) ? section.prerequisiteIds.filter(isUuid) : [],
          updated_at: now,
        }, section.id);
        keepSections.add(savedSection.id);

        for (const [moduleIndex, module] of (section.modules || []).entries()) {
          const savedModule = await upsertRow('course_modules', {
            course_id: id,
            section_id: savedSection.id,
            number: module.number || String(moduleIndex + 1).padStart(2, '0'),
            title: module.title || `Module ${moduleIndex + 1}`,
            duration: module.time || module.duration || '',
            description: module.description || '',
            sort_order: moduleIndex,
            updated_at: now,
          }, module.id);
          keepModules.add(savedModule.id);

          for (const [lessonIndex, lesson] of (module.lessons || []).entries()) {
            const savedLesson = await upsertRow('course_lessons', {
              course_id: id,
              module_id: savedModule.id,
              number: lesson.number || '',
              type: lesson.type || 'LESSON',
              title: lesson.title || 'Lesson',
              minutes: Number(lesson.minutes) || 0,
              copy: lesson.copy || '',
              video_url: lesson.videoUrl || null,
              image_url: lesson.imageUrl || null,
              resource_url: lesson.resourceUrl || null,
              resource_label: lesson.resourceLabel || null,
              is_current: Boolean(lesson.isCurrent) || (!firstLesson && sectionIndex === 0 && moduleIndex === 0 && lessonIndex === 0),
              sort_order: lessonIndex,
              updated_at: now,
            }, lesson.id);
            keepLessons.add(savedLesson.id);
            if (!firstLesson) firstLesson = savedLesson;
            await syncLessonContent(savedLesson.id, lesson);
          }
        }
      }

      await deleteMissing('course_lessons', id, keepLessons);
      await deleteMissing('course_modules', id, keepModules);
      await deleteMissing('course_sections', id, keepSections);

      return hydrate(await getCourseRow(id));
    },

    async deleteCourse(id) {
      await supabaseRequest(`courses?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async setCourseStatus(id, status) {
      if (!['draft', 'published', 'archived'].includes(status)) {
        const error = new Error('Status must be draft, published, or archived.');
        error.status = 400;
        throw error;
      }
      await supabaseRequest(`courses?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: { status, updated_at: new Date().toISOString() },
      });
      return hydrate(await getCourseRow(id));
    },

    async listLessonProgress(email, courseId) {
      try {
        return await supabaseRequest(
          `lesson_progress?student_email=eq.${encodeURIComponent(email)}&course_id=eq.${encodeURIComponent(courseId)}&select=lesson_id,status,completed_at`,
        );
      } catch {
        return [];
      }
    },

    async saveLessonProgress({ email, courseId, lessonId, status = 'completed' }) {
      const now = new Date().toISOString();
      const completed = status === 'completed';
      return supabaseRequest('lesson_progress?on_conflict=student_email,lesson_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: {
          student_email: email,
          course_id: courseId,
          lesson_id: lessonId,
          status: completed ? 'completed' : 'started',
          completed_at: completed ? now : null,
          updated_at: now,
        },
      });
    },

    async seedBuiltIn() {
      const existing = await listCourses();
      const ids = new Set((existing || []).map((row) => row.id));
      const payloads = seedPayloadFromCatalog(SEED_COURSES).filter((course) => !ids.has(course.id));
      for (const payload of payloads) {
        await this.saveCourse(payload);
      }
      return {
        seeded: payloads.length > 0,
        added: payloads.length,
        count: ids.size + payloads.length,
      };
    },

    async listMedia(kind) {
      const filter = kind ? `&kind=eq.${encodeURIComponent(kind)}` : '';
      return supabaseRequest(`media_assets?select=*&order=created_at.desc${filter}`);
    },

    async saveMedia(record) {
      return supabaseRequest('media_assets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: record,
      });
    },

    async deleteMedia(id) {
      const rows = await supabaseRequest(`media_assets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const row = rows?.[0];
      if (row) {
        await supabaseRequest(`media_assets?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      return row || null;
    },

    async listAdminEnrollments() {
      return supabaseRequest('enrollments?select=id,student_email,student_name,college,course_id,course_name,paid,razorpay_order_id,razorpay_payment_id,enrolled_at&order=enrolled_at.desc');
    },

    async writeAudit(action, entity, entityId, detail) {
      await supabaseRequest('admin_audit', {
        method: 'POST',
        body: { action, entity, entity_id: entityId || null, detail: detail || {} },
      });
    },

    async listAudit() {
      return supabaseRequest('admin_audit?select=*&order=created_at.desc&limit=80');
    },

    async getSettings() {
      const rows = await supabaseRequest('site_settings?select=*');
      return Object.fromEntries((rows || []).map((row) => [row.key, unwrapSetting(row.value)]));
    },

    async saveSettings(entries) {
      for (const [key, value] of Object.entries(entries)) {
        await supabaseRequest('site_settings?on_conflict=key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: { key, value, updated_at: new Date().toISOString() },
        });
      }
      return this.getSettings();
    },
  };
}

export function unwrapSetting(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

export function seedPayloadFromCatalog(details) {
  return details.map((course, index) => ({
    id: course.id,
    name: course.name,
    category: course.category,
    weeks: course.weeks,
    price: course.price,
    blurb: course.blurb,
    tools: course.tools,
    project: course.project,
    lesson: course.lesson,
    status: 'published',
    featured: index === 0,
    sortOrder: index,
    sections: [{
      title: course.name,
      slug: 'course-path',
      shortDescription: course.blurb || '',
      status: 'published',
      modules: (course.modules || []).map((module, moduleIndex) => ({
        number: module.number,
        title: module.title,
        time: module.time,
        sortOrder: moduleIndex,
        lessons: moduleIndex === Math.max(0, (course.modules || []).length - 1) && course.lesson
          ? [{
            number: course.lesson.number,
            type: course.lesson.type,
            title: course.lesson.title,
            minutes: course.lesson.minutes,
            copy: course.lesson.copy,
            isCurrent: true,
          }]
          : [],
      })),
    }],
  }));
}
