import { SEED_COURSES } from './seed-courses.mjs';
import { stripProtectedMedia, withStudentMediaProxy } from './student-media.mjs';

const COURSE_COLUMNS = 'id,name,category,weeks,price,blurb,tools,project,cover_image_url,thumbnail_url,promo_video_url,lesson,status,featured,sort_order,seo_title,seo_description,created_at,updated_at';

export function mapCourseRecord(row, modules = [], lessons = []) {
  if (!row) return null;
  const current = lessons.find((lesson) => lesson.is_current) || lessons[0] || row.lesson || {};
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
    modules: modules.map((module) => ({
      id: module.id,
      number: module.number || '',
      title: module.title,
      time: module.duration || '',
      description: module.description || '',
    })),
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.module_id,
      number: lesson.number || '',
      type: lesson.type || 'LESSON',
      title: lesson.title,
      minutes: Number(lesson.minutes) || 0,
      copy: lesson.copy || '',
      videoUrl: lesson.video_url || '',
      imageUrl: lesson.image_url || '',
      resourceUrl: lesson.resource_url || '',
      resourceLabel: lesson.resource_label || '',
      isCurrent: Boolean(lesson.is_current),
    })),
    lesson: {
      id: current.id || current.lesson?.id || '',
      number: current.number || current.lesson?.number || '',
      type: current.type || current.lesson?.type || 'LESSON',
      title: current.title || current.lesson?.title || row.name,
      minutes: Number(current.minutes || current.lesson?.minutes) || 0,
      copy: current.copy || current.lesson?.copy || row.blurb || '',
      videoUrl: current.video_url || current.videoUrl || '',
      imageUrl: current.image_url || current.imageUrl || '',
      resourceUrl: current.resource_url || current.resourceUrl || '',
      resourceLabel: current.resource_label || current.resourceLabel || '',
    },
  };
}

export function toPublicCourse(row, modules = [], lessons = []) {
  return stripProtectedMedia(mapCourseRecord(row, modules, lessons));
}

export function toStudentCourse(row, modules = [], lessons = []) {
  return withStudentMediaProxy(mapCourseRecord(row, modules, lessons));
}

export function toAdminCourse(row, modules = [], lessons = []) {
  const course = mapCourseRecord(row, modules, lessons);
  return {
    ...course,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCms({ supabaseRequest }) {
  async function listCourses() {
    return supabaseRequest(`courses?select=${COURSE_COLUMNS}&order=sort_order.asc,created_at.desc`);
  }

  async function getCourseRow(id) {
    const rows = await supabaseRequest(`courses?id=eq.${encodeURIComponent(id)}&select=${COURSE_COLUMNS}&limit=1`);
    return rows?.[0] || null;
  }

  async function modulesFor(courseId) {
    return supabaseRequest(`course_modules?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=sort_order.asc`);
  }

  async function lessonsFor(courseId) {
    return supabaseRequest(`course_lessons?course_id=eq.${encodeURIComponent(courseId)}&select=*&order=sort_order.asc`);
  }

  async function hydrate(row) {
    if (!row) return null;
    const [modules, lessons] = await Promise.all([modulesFor(row.id), lessonsFor(row.id)]);
    return { row, modules: modules || [], lessons: lessons || [] };
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
      const id = String(input.id || '').trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(id)) {
        const error = new Error('Course id must be lowercase letters, numbers, and hyphens.');
        error.status = 400;
        throw error;
      }
      const now = new Date().toISOString();
      const course = {
        id,
        name: String(input.name || '').trim(),
        category: String(input.category || 'analytics').trim(),
        weeks: Number(input.weeks) || 8,
        price: Number(input.price) || 0,
        blurb: String(input.blurb || '').trim(),
        tools: Array.isArray(input.tools) ? input.tools.map((tool) => String(tool).trim()).filter(Boolean) : [],
        project: String(input.project || '').trim(),
        cover_image_url: String(input.coverImageUrl || '').trim() || null,
        thumbnail_url: String(input.thumbnailUrl || '').trim() || null,
        promo_video_url: String(input.promoVideoUrl || '').trim() || null,
        lesson: input.lesson || null,
        status: ['draft', 'published', 'archived'].includes(input.status) ? input.status : 'draft',
        featured: Boolean(input.featured),
        sort_order: Number(input.sortOrder) || 0,
        seo_title: String(input.seoTitle || '').trim() || null,
        seo_description: String(input.seoDescription || '').trim() || null,
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

      await supabaseRequest(`course_modules?course_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

      const modules = Array.isArray(input.modules) ? input.modules : [];
      const lessons = Array.isArray(input.lessons) ? input.lessons : [];
      const moduleIdMap = new Map();

      for (const [index, module] of modules.entries()) {
        const rows = await supabaseRequest('course_modules', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: {
            course_id: id,
            number: module.number || String(index + 1).padStart(2, '0'),
            title: module.title || `Module ${index + 1}`,
            duration: module.time || module.duration || '',
            description: module.description || '',
            sort_order: index,
          },
        });
        const saved = Array.isArray(rows) ? rows[0] : rows;
        if (module.id) moduleIdMap.set(module.id, saved.id);
        moduleIdMap.set(`index-${index}`, saved.id);
      }

      for (const [index, lesson] of lessons.entries()) {
        const moduleId = moduleIdMap.get(lesson.moduleId) || moduleIdMap.get(`index-${lesson.moduleIndex || 0}`) || null;
        await supabaseRequest('course_lessons', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: {
            course_id: id,
            module_id: moduleId,
            number: lesson.number || '',
            type: lesson.type || 'LESSON',
            title: lesson.title || 'Lesson',
            minutes: Number(lesson.minutes) || 0,
            copy: lesson.copy || '',
            video_url: lesson.videoUrl || null,
            image_url: lesson.imageUrl || null,
            resource_url: lesson.resourceUrl || null,
            resource_label: lesson.resourceLabel || null,
            is_current: Boolean(lesson.isCurrent) || index === 0,
            sort_order: index,
          },
        });
      }

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
    modules: (course.modules || []).map((module, moduleIndex) => ({
      number: module.number,
      title: module.title,
      time: module.time,
      sortOrder: moduleIndex,
    })),
    lessons: course.lesson ? [{
      number: course.lesson.number,
      type: course.lesson.type,
      title: course.lesson.title,
      minutes: course.lesson.minutes,
      copy: course.lesson.copy,
      isCurrent: true,
      moduleIndex: Math.max(0, (course.modules || []).length - 1),
    }] : [],
  }));
}
