import { isIP } from 'node:net';
import { readSignedCookie } from './access-auth.mjs';
import { readSession } from './admin-auth.mjs';
import { readEnv } from './env.mjs';
import { flattenLessons, sectionIsVisible } from './hierarchy.mjs';
import { normalizeEmail } from './http.mjs';

export const STUDENT_COOKIE = 'gf_student';
export const MEDIA_KINDS = new Set(['video', 'image', 'resource']);

const VIEWABLE_EXT = /\.(mp4|webm|m4v|mov|png|jpe?g|gif|webp|svg|pdf|txt)$/i;
const VIEWABLE_TYPES = /^(video|image)\//i;

export function studentMediaPath(courseId, kind, lessonId = '') {
  const params = new URLSearchParams({
    course: String(courseId || ''),
    kind: String(kind || ''),
  });
  if (lessonId) params.set('lesson', String(lessonId));
  return `/api/lesson-media?${params}`;
}

export function isViewableResource(url = '', label = '') {
  const value = `${url} ${label}`;
  if (VIEWABLE_EXT.test(value)) return true;
  try {
    const parsed = new URL(url, 'https://gradflow.local');
    return VIEWABLE_EXT.test(parsed.pathname);
  } catch {
    return false;
  }
}

function mapCourseLessons(course, mapper) {
  return {
    ...course,
    lesson: mapper(course.lesson),
    lessons: Array.isArray(course.lessons) ? course.lessons.map((lesson) => mapper(lesson)) : [],
    sections: Array.isArray(course.sections)
      ? course.sections.map((section) => ({
        ...section,
        modules: (section.modules || []).map((module) => ({
          ...module,
          lessons: (module.lessons || []).map((lesson) => mapper(lesson)),
        })),
      }))
      : [],
  };
}

export function stripProtectedMedia(course) {
  if (!course) return course;
  return mapCourseLessons(course, wipeLessonMedia);
}

export function withStudentMediaProxy(course) {
  if (!course) return course;
  return mapCourseLessons(course, (lesson) => proxyLessonMedia(course.id, lesson));
}

function wipeLessonMedia(lesson = {}) {
  return {
    ...lesson,
    videoUrl: '',
    imageUrl: '',
    resourceUrl: '',
  };
}

export function lessonAllowsDownload(lesson = {}) {
  return lesson.allowDownload === true || lesson.allow_download === true || lesson.allowDownload === 'true';
}

function proxyLessonMedia(courseId, lesson = {}) {
  const next = { ...lesson };
  const allowDownload = lessonAllowsDownload(lesson);
  next.allowDownload = allowDownload;
  next.videoUrl = lesson.videoUrl ? studentMediaPath(courseId, 'video', lesson.id) : '';
  next.imageUrl = lesson.imageUrl ? studentMediaPath(courseId, 'image', lesson.id) : '';
  const viewable = Boolean(lesson.resourceUrl && isViewableResource(lesson.resourceUrl, lesson.resourceLabel));
  if (lesson.resourceUrl && (viewable || allowDownload)) {
    next.resourceUrl = studentMediaPath(courseId, 'resource', lesson.id);
    next.resourceViewable = viewable;
    next.resourceDownloadable = allowDownload;
    next.resourceBlocked = false;
  } else {
    next.resourceViewable = false;
    next.resourceDownloadable = false;
    next.resourceBlocked = Boolean(lesson.resourceUrl);
    next.resourceUrl = '';
  }
  return next;
}

export function isBlockedMediaHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'metadata.google.internal') return true;
  const version = isIP(host);
  if (!version) return false;
  if (version === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  const [a, b] = host.split('.').map(Number);
  if (a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertSafeMediaUrl(raw, supabaseUrl = '') {
  const url = new URL(String(raw || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const error = new Error('This file cannot be opened in the lesson player.');
    error.status = 400;
    throw error;
  }
  if (isBlockedMediaHost(url.hostname)) {
    const error = new Error('This file cannot be opened in the lesson player.');
    error.status = 400;
    throw error;
  }
  if (supabaseUrl) {
    try {
      const allowed = new URL(supabaseUrl);
      if (url.hostname === allowed.hostname) return url;
    } catch { /* continue */ }
  }
  return url;
}

export function selectedLesson(courseRecord, lessonId = '') {
  const nested = flattenLessons(courseRecord?.sections || []);
  const lessons = [...nested, ...(courseRecord?.lessons || [])];
  return (lessonId && lessons.find((lesson) => String(lesson.id) === String(lessonId)))
    || lessons.find((lesson) => lesson.isCurrent)
    || lessons[0]
    || courseRecord?.lesson
    || {};
}

export function lessonSource(courseRecord, kind, lessonId = '') {
  const selected = selectedLesson(courseRecord, lessonId);
  if (kind === 'video') return selected.videoUrl || '';
  if (kind === 'image') return selected.imageUrl || '';
  if (kind === 'resource') return selected.resourceUrl || '';
  return '';
}

export function mediaFileName(url, fallback = 'lesson-file') {
  try {
    const name = decodeURIComponent(new URL(String(url || ''), 'https://gradflow.local').pathname.split('/').pop() || '');
    const cleaned = name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

export function inlineMediaHeaders({ contentType, contentLength, contentRange, acceptRanges, head = false, download = false, filename = '' }) {
  const headers = {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': download
      ? `attachment; filename="${String(filename || 'lesson-file').replace(/["\\]/g, '_')}"`
      : 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
  if (contentRange) headers['Content-Range'] = contentRange;
  if (contentLength && !head) headers['Content-Length'] = String(contentLength);
  return headers;
}

export async function authorizeLessonMedia({ req, query, env, supabase }) {
  const courseId = String(query.course || '').trim();
  const kind = String(query.kind || '').trim();
  if (!courseId || !MEDIA_KINDS.has(kind)) {
    return { error: { status: 400, body: { error: 'Lesson media was not found.' } } };
  }
  if (readSession(req, env)) {
    return { courseId, kind, lessonId: String(query.lesson || ''), privileged: true };
  }
  const session = readSignedCookie(req, STUDENT_COOKIE, env);
  const email = normalizeEmail(session?.subject);
  if (!email) {
    return { error: { status: 401, body: { error: 'Sign in to view this lesson.' } } };
  }
  const enrollment = supabase ? await supabase.getEnrollment(email, courseId) : null;
  if (!enrollment?.paid) {
    return { error: { status: 403, body: { error: 'Enroll to view this lesson.' } } };
  }
  return { courseId, kind, lessonId: String(query.lesson || ''), email };
}

export async function fetchLessonSource({ sourceUrl, supabaseUrl, serviceRoleKey, range, fetchImpl = fetch }) {
  const url = assertSafeMediaUrl(sourceUrl, supabaseUrl);
  const headers = {};
  if (range) headers.Range = range;
  if (supabaseUrl && url.hostname === new URL(supabaseUrl).hostname && serviceRoleKey) {
    headers.apikey = serviceRoleKey;
    headers.Authorization = `Bearer ${serviceRoleKey}`;
    if (url.pathname.includes('/object/public/')) {
      url.pathname = url.pathname.replace('/object/public/', '/object/');
    }
  }
  const response = await fetchImpl(url, { headers });
  return { url, response };
}

export function rejectDownloadQuery(query = {}) {
  return Boolean(query.download || query.attachment || query.dl || query.asAttachment);
}

export async function serveLessonMedia({ req, query, env, course, status, supabase, fetchImpl = fetch }) {
  const access = await authorizeLessonMedia({ req, query, env, supabase });
  if (access.error) return access.error;
  if (!course || (status !== 'published' && !access.privileged)) {
    return { status: 404, body: { error: 'Lesson media was not found.' } };
  }

  if (access.lessonId && !sectionIsVisible(course, access.lessonId, { includeDrafts: access.privileged })) {
    return { status: 404, body: { error: 'Lesson media was not found.' } };
  }
  const lesson = selectedLesson(course, access.lessonId);
  const sourceUrl = lessonSource(course, access.kind, access.lessonId);
  if (!sourceUrl) {
    return { status: 404, body: { error: 'Lesson media was not found.' } };
  }
  const allowDownload = lessonAllowsDownload(lesson);
  const viewableResource = isViewableResource(sourceUrl, lesson.resourceLabel);
  if (access.kind === 'resource' && !viewableResource && !allowDownload) {
    return { status: 403, body: { error: 'This file can be viewed only in the admin workspace.' } };
  }

  const runtime = readEnv(env);
  let upstream;
  try {
    upstream = await fetchLessonSource({
      sourceUrl,
      supabaseUrl: runtime.supabaseUrl,
      serviceRoleKey: runtime.supabaseServiceRoleKey,
      range: req?.headers?.range || req?.headers?.Range,
      fetchImpl,
    });
  } catch (error) {
    return { status: error.status || 400, body: { error: error.message || 'This file cannot be opened in the lesson player.' } };
  }

  const { response } = upstream;
  if (!response.ok && response.status !== 206) {
    return { status: 502, body: { error: 'Lesson media could not be opened.' } };
  }

  const rawType = response.headers.get('content-type') || '';
  const contentType = !rawType || /octet-stream/i.test(rawType)
    ? guessType(sourceUrl, access.kind)
    : rawType;
  const typedViewable = !contentType || VIEWABLE_TYPES.test(contentType) || /pdf|text\/plain/i.test(contentType);
  if (access.kind === 'resource' && !typedViewable && !allowDownload) {
    return { status: 403, body: { error: 'This file can be viewed only in the admin workspace.' } };
  }

  const head = req?.method === 'HEAD';
  const asAttachment = allowDownload && (
    rejectDownloadQuery(query)
    || (access.kind === 'resource' && !viewableResource)
  );
  return {
    status: response.status,
    headers: inlineMediaHeaders({
      contentType,
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      acceptRanges: response.headers.get('accept-ranges') || 'bytes',
      head,
      download: asAttachment,
      filename: mediaFileName(sourceUrl),
    }),
    upstream: head ? null : response.body,
  };
}

function guessType(url, kind) {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'image') return 'image/jpeg';
  if (/\.pdf$/i.test(url)) return 'application/pdf';
  return 'application/octet-stream';
}
