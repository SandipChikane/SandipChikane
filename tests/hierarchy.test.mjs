import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSignedCookie } from '../lib/access-auth.mjs';
import { normalizeSavePayload, toPublicCourse, toStudentCourse } from '../lib/cms.mjs';
import {
  computeProgress,
  continueLabel,
  continueTarget,
  nestHierarchy,
  sectionIsVisible,
} from '../lib/hierarchy.mjs';
import { serveLessonMedia } from '../lib/student-media.mjs';

const env = { ADMIN_SESSION_SECRET: 'media-secret', ADMIN_EMAIL: 'admin@gradflow.local' };

function studentReq() {
  const { cookie } = createSignedCookie('gf_student', 'ria@college.edu', env, 60_000);
  return { method: 'GET', headers: { cookie: cookie.split(';')[0] } };
}

const sections = [
  {
    id: 'sec-a',
    title: 'Track A',
    slug: 'track-a',
    status: 'published',
    modules: [
      {
        id: 'mod-a',
        title: 'A1',
        lessons: [
          { id: 'l1', title: 'One', minutes: 10 },
          { id: 'l2', title: 'Two', minutes: 10 },
        ],
      },
    ],
  },
  {
    id: 'sec-b',
    title: 'Track B',
    slug: 'track-b',
    status: 'published',
    modules: [
      {
        id: 'mod-b',
        title: 'B1',
        lessons: [
          { id: 'l3', title: 'Three', minutes: 10 },
          { id: 'l4', title: 'Four', minutes: 10 },
          { id: 'l5', title: 'Five', minutes: 10 },
        ],
      },
    ],
  },
];

describe('learning hierarchy', () => {
  it('nests modules that belong to a section and keeps orphan modules on the first section', () => {
    const nested = nestHierarchy(
      [{ id: 's1', title: 'First', slug: 'first' }, { id: 's2', title: 'Second', slug: 'second' }],
      [
        { id: 'm1', sectionId: 's2', title: 'Owned' },
        { id: 'm2', title: 'Orphan' },
      ],
      [{ id: 'l1', moduleId: 'm1', title: 'Lesson' }],
    );
    assert.equal(nested[0].modules[0].title, 'Orphan');
    assert.equal(nested[1].modules[0].title, 'Owned');
    assert.equal(nested[1].modules[0].lessons[0].title, 'Lesson');
  });

  it('weights overall progress by lesson count, not section averages', () => {
    const progress = computeProgress(sections, ['l1', 'l2']);
    assert.equal(progress.completed, 2);
    assert.equal(progress.total, 5);
    assert.equal(progress.percent, 40);
    assert.equal(progress.sections[0].percent, 100);
    assert.equal(progress.sections[1].percent, 0);
    assert.deepEqual(progress.completedIds, ['l1', 'l2']);
  });

  it('labels continue, start, and review from progress', () => {
    assert.equal(continueLabel('Track B', continueTarget([sections[1]], [])), 'Start Track B');
    assert.equal(continueLabel('Track B', continueTarget([sections[1]], ['l3'])), 'Continue Track B');
    assert.equal(continueLabel('Track B', continueTarget([sections[1]], ['l3', 'l4', 'l5'])), 'Review Track B');
    assert.equal(continueTarget(sections, ['l1']).lesson.id, 'l2');
  });

  it('wraps a legacy module list into one published section on save', () => {
    const payload = normalizeSavePayload({
      name: 'Legacy Path',
      blurb: 'Older syllabus',
      modules: [{ id: 'm1', title: 'Intro' }],
      lessons: [{ title: 'Hello', moduleId: 'm1' }],
    });
    assert.equal(payload.sections.length, 1);
    assert.equal(payload.sections[0].status, 'published');
    assert.equal(payload.sections[0].modules[0].lessons[0].title, 'Hello');
  });

  it('hides draft sections and lesson media from students', () => {
    const row = {
      id: 'lab',
      name: 'Lab',
      category: 'tech',
      weeks: 2,
      price: 1,
      blurb: 'Lab',
      tools: [],
      status: 'published',
    };
    const dbSections = [
      { id: 'draft', title: 'Hidden', slug: 'hidden', status: 'draft', sort_order: 0 },
      { id: 'live', title: 'Visible', slug: 'visible', status: 'published', sort_order: 1 },
    ];
    const modules = [
      { id: 'md', section_id: 'draft', title: 'Draft module' },
      { id: 'ml', section_id: 'live', title: 'Live module' },
    ];
    const lessons = [
      { id: 'ld', module_id: 'md', title: 'Secret', video_url: 'https://cdn.example.com/secret.mp4' },
      { id: 'll', module_id: 'ml', title: 'Open', video_url: 'https://cdn.example.com/open.mp4' },
    ];
    const publicCourse = toPublicCourse(row, modules, lessons, dbSections);
    const studentCourse = toStudentCourse(row, modules, lessons, dbSections);
    assert.equal(publicCourse.sections.length, 1);
    assert.equal(publicCourse.sections[0].title, 'Visible');
    assert.equal(JSON.stringify(publicCourse).includes('secret.mp4'), false);
    assert.equal(studentCourse.sections.length, 1);
    assert.equal(studentCourse.sections[0].modules[0].lessons[0].id, 'll');
    assert.equal(JSON.stringify(studentCourse).includes('secret.mp4'), false);
    assert.equal(sectionIsVisible(studentCourse, 'ld'), false);
    assert.equal(sectionIsVisible({ sections: toStudentCourse(row, modules, lessons, dbSections).sections.concat([{
      id: 'draft',
      status: 'draft',
      modules: [{ id: 'md', lessons: [{ id: 'ld' }] }],
    }]) }, 'ld'), false);
  });

  it('blocks enrolled students from draft-section media by URL', async () => {
    const result = await serveLessonMedia({
      req: studentReq(),
      query: { course: 'lab', kind: 'video', lesson: 'draft-lesson' },
      env,
      status: 'published',
      supabase: { getEnrollment: async () => ({ paid: true }) },
      course: {
        id: 'lab',
        sections: [{
          id: 's-draft',
          status: 'draft',
          modules: [{ id: 'm1', lessons: [{ id: 'draft-lesson', videoUrl: 'https://cdn.example.com/secret.mp4' }] }],
        }],
      },
    });
    assert.equal(result.status, 404);
  });
});
