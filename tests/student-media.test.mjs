import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSignedCookie } from '../lib/access-auth.mjs';
import { createSessionCookie } from '../lib/admin-auth.mjs';
import {
  authorizeLessonMedia,
  inlineMediaHeaders,
  isViewableResource,
  rejectDownloadQuery,
  serveLessonMedia,
  studentMediaPath,
} from '../lib/student-media.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ADMIN_SESSION_SECRET: 'media-secret', ADMIN_EMAIL: 'admin@gradflow.local' };

function adminReq(extra = {}) {
  const { cookie } = createSessionCookie(env);
  return {
    method: 'GET',
    headers: { cookie: cookie.split(';')[0], ...extra.headers },
  };
}

function studentReq() {
  const { cookie } = createSignedCookie('gf_student', 'ria@college.edu', env, 60_000);
  return {
    method: 'GET',
    headers: { cookie: cookie.split(';')[0] },
  };
}

describe('student media protection', () => {
  it('builds same-origin lesson media paths instead of file URLs', () => {
    assert.equal(studentMediaPath('lab', 'video', 'l1'), '/api/lesson-media?course=lab&kind=video&lesson=l1');
    assert.equal(isViewableResource('https://cdn.example.com/notes.pdf', 'Notes'), true);
    assert.equal(isViewableResource('https://cdn.example.com/pack.zip', 'Pack'), false);
    assert.equal(rejectDownloadQuery({ download: '1' }), true);
  });

  it('rejects anonymous lesson media requests', async () => {
    const result = await authorizeLessonMedia({
      req: { headers: {} },
      query: { course: 'lab', kind: 'video' },
      env,
      supabase: { getEnrollment: async () => ({ paid: true }) },
    });
    assert.equal(result.error.status, 401);
  });

  it('rejects a signed-in student who is not enrolled', async () => {
    const result = await authorizeLessonMedia({
      req: studentReq(),
      query: { course: 'lab', kind: 'video' },
      env,
      supabase: { getEnrollment: async () => null },
    });
    assert.equal(result.error.status, 403);
  });

  it('streams lesson video inline and ignores download=1', async () => {
    const bytes = Buffer.from('fake-mp4');
    const result = await serveLessonMedia({
      req: adminReq(),
      query: { course: 'lab', kind: 'video', download: '1' },
      env,
      status: 'published',
      course: {
        id: 'lab',
        lesson: { videoUrl: 'https://cdn.example.com/lesson.mp4' },
        lessons: [{ id: 'l1', isCurrent: true, videoUrl: 'https://cdn.example.com/lesson.mp4' }],
      },
      fetchImpl: async (url, options = {}) => {
        assert.match(String(url), /cdn\.example\.com\/lesson\.mp4/);
        assert.equal(options.headers?.Range, undefined);
        return new Response(bytes, {
          status: 200,
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
        });
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers['Content-Disposition'], 'inline');
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
    assert.equal(result.body, undefined);
    const streamed = Buffer.from(await new Response(result.upstream).arrayBuffer());
    assert.equal(streamed.toString(), 'fake-mp4');
  });

  it('blocks non-viewable student resources', async () => {
    const result = await serveLessonMedia({
      req: adminReq(),
      query: { course: 'lab', kind: 'resource' },
      env,
      status: 'published',
      course: {
        id: 'lab',
        lesson: { resourceUrl: 'https://cdn.example.com/pack.zip', resourceLabel: 'Pack' },
        lessons: [{ id: 'l1', isCurrent: true, resourceUrl: 'https://cdn.example.com/pack.zip' }],
      },
    });
    assert.equal(result.status, 403);
  });

  it('forces inline headers even when a filename is present', () => {
    const headers = inlineMediaHeaders({ contentType: 'application/pdf', contentLength: 12 });
    assert.equal(headers['Content-Disposition'], 'inline');
    assert.equal(Object.values(headers).some((value) => String(value).includes('attachment')), false);
  });

  it('removes download controls from the student course player', () => {
    const source = readFileSync(path.join(ROOT, 'course.js'), 'utf8');
    assert.match(source, /controlsList = 'nodownload/);
    assert.equal(source.includes('Download resource'), false);
    assert.match(source, /View in the browser/);
  });
});
