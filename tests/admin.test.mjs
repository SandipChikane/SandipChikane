import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAdminHandlers, adminEnrollment } from '../lib/admin-handlers.mjs';
import { emailsMatch, passwordsMatch, signSession } from '../lib/admin-auth.mjs';
import { seedPayloadFromCatalog, toPublicCourse, unwrapSetting } from '../lib/cms.mjs';
import { publicEnrollment } from '../lib/supabase.mjs';
import { SEED_COURSES } from '../lib/seed-courses.mjs';

describe('admin auth', () => {
  it('rejects a wrong password', async () => {
    const api = createAdminHandlers({
      env: { ADMIN_PASSWORD: 'correct-horse', ADMIN_SESSION_SECRET: 'secret' },
    });
    const result = await api.login({}, { email: 'admin@gradflow.local', password: 'wrong' });
    assert.equal(result.status, 401);
  });

  it('rejects the right password with the wrong email', async () => {
    const api = createAdminHandlers({
      env: { ADMIN_EMAIL: 'admin@gradflow.local', ADMIN_PASSWORD: 'correct-horse', ADMIN_SESSION_SECRET: 'secret' },
    });
    const result = await api.login({}, { email: 'other@gradflow.local', password: 'correct-horse' });
    assert.equal(result.status, 401);
  });

  it('sets a session cookie for the right email and password', async () => {
    const api = createAdminHandlers({
      env: { ADMIN_EMAIL: 'admin@gradflow.local', ADMIN_PASSWORD: 'correct-horse', ADMIN_SESSION_SECRET: 'secret' },
    });
    const result = await api.login({}, { email: 'admin@gradflow.local', password: 'correct-horse' });
    assert.equal(result.status, 200);
    assert.match(result.headers['Set-Cookie'], /gf_admin=/);
  });

  it('compares passwords and emails in constant time', () => {
    assert.equal(passwordsMatch('abc', 'abc'), true);
    assert.equal(passwordsMatch('abc', 'xyz'), false);
    assert.equal(emailsMatch('Admin@Gradflow.local', 'admin@gradflow.local'), true);
    assert.equal(signSession('1', 'secret').length, 64);
  });
});

describe('cms mapping', () => {
  it('exposes lesson media on the public course payload', () => {
    const course = toPublicCourse({
      id: 'demo-lab',
      name: 'Demo Lab',
      category: 'tech',
      weeks: 4,
      price: 1999,
      blurb: 'A short path.',
      tools: ['SQL'],
      project: 'Lab brief',
      status: 'published',
      featured: false,
      sort_order: 1,
    }, [{ id: 'm1', number: '01', title: 'Start', duration: '1 week' }], [{
      id: 'l1',
      module_id: 'm1',
      number: '01',
      type: 'LESSON',
      title: 'Welcome',
      minutes: 12,
      copy: 'Watch this first.',
      video_url: 'https://example.com/lesson.mp4',
      image_url: 'https://example.com/still.jpg',
      is_current: true,
    }]);
    assert.equal(course.lesson.videoUrl, 'https://example.com/lesson.mp4');
    assert.equal(course.modules[0].title, 'Start');
  });

  it('seeds every built-in course as published', () => {
    const payloads = seedPayloadFromCatalog(SEED_COURSES);
    assert.equal(payloads.length, 5);
    assert.ok(payloads.every((course) => course.status === 'published'));
  });

  it('unwraps jsonb settings to strings', () => {
    assert.equal(unwrapSetting('Cohort opens Monday'), 'Cohort opens Monday');
    assert.equal(unwrapSetting(null), '');
  });
});

describe('admin vs TPO payloads', () => {
  const row = {
    student_email: 'ria.test@vitstudent.ac.in',
    student_name: 'Ria Test',
    college: 'VIT Vellore',
    course_id: 'data-analytics',
    course_name: 'Data Analytics in the Wild',
    paid: true,
    enrolled_at: '2026-09-13T00:00:00.000Z',
    razorpay_order_id: 'order_secret',
    razorpay_payment_id: 'pay_secret',
  };

  it('lets the admin see payment ids', () => {
    const admin = adminEnrollment(row);
    assert.equal(admin.razorpayPaymentId, 'pay_secret');
  });

  it('still hides payment ids from TPO payloads', () => {
    const tpo = publicEnrollment(row);
    assert.equal('razorpayPaymentId' in tpo, false);
    assert.equal(JSON.stringify(tpo).includes('pay_secret'), false);
  });
});
