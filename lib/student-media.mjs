import { isIP } from 'node:net';
import { readSignedCookie } from './access-auth.mjs';
import { readSession } from './admin-auth.mjs';
import { readEnv } from './env.mjs';
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

export function stripProtectedMedia(course) {
  if (!course) return course;
  return {
    ...course,
    lesson: wipeLessonMedia(course.lesson),
    lessons: Array.isArray(course.lessons) ? course.lessons.map((lesson) => wipeLessonMedia(lesson)) : [],
  };
}

export function withStudentMediaProxy(course) {
  if (!course) return course;
  return {
    ...course,
    lesson: proxyLessonMedia(course.id, course.lesson),
    lessons: Array.isArray(course.lessons) ? course.lessons.map((lesson) => proxyLessonMedia(course.id, lesson)) : [],
  };
}

function wipeLessonMedia(lesson = {}) {
  return {
    ...lesson,
    videoUrl: '',
    imageUrl: '',
    resourceUrl: '',
  };
}

function proxyLessonMedia(courseId, lesson = {}) {
  const next = { ...lesson };
  next.videoUrl = lesson.videoUrl ? studentMediaPath(courseId, 'video', lesson.id) : '';
  next.imageUrl = lesson.imageUrl ? studentMediaPath(courseId, 'image', lesson.id) : '';
  if (lesson.resourceUrl && isViewableResource(lesson.resourceUrl, lesson.resourceLabel)) {
    next.resourceUrl = studentMediaPath(courseId, 'resource', lesson.id);
    next.resourceViewable = true;
  } else {
    next.resourceViewable = false;
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

export function lessonSource(courseRecord, kind, lessonId = '') {
  const lessons = courseRecord?.lessons || [];
  const selected = (lessonId && lessons.find((lesson) => String(lesson.id) === String(lessonId)))
    || lessons.find((lesson) => lesson.isCurrent)
    || lessons[0]
    || courseRecord?.lesson
    || {};
  if (kind === 'video') return selected.videoUrl || '';
  if (kind === 'image') return selected.imageUrl || '';
  if (kind === 'resource') return selected.resourceUrl || '';
  return '';
}

export function inlineMediaHeaders({ contentType, contentLength, contentRange, acceptRanges, head = false }) {
  const headers = {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': 'inline',
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

  const sourceUrl = lessonSource(course, access.kind, access.lessonId);
  if (!sourceUrl) {
    return { status: 404, body: { error: 'Lesson media was not found.' } };
  }
  if (access.kind === 'resource' && !isViewableResource(sourceUrl, course.lesson?.resourceLabel)) {
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
  if (access.kind === 'resource' && contentType && !VIEWABLE_TYPES.test(contentType) && !/pdf|text\/plain/i.test(contentType)) {
    return { status: 403, body: { error: 'This file can be viewed only in the admin workspace.' } };
  }

  const head = req?.method === 'HEAD';
  return {
    status: response.status,
    headers: inlineMediaHeaders({
      contentType,
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      acceptRanges: response.headers.get('accept-ranges') || 'bytes',
      head,
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
