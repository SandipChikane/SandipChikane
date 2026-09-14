import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHandlers } from '../lib/handlers.mjs';
import { defaultLanding, parseLanding } from '../lib/landing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('landing CMS', () => {
  it('keeps the current homepage copy as the default', () => {
    const landing = defaultLanding();
    assert.equal(landing.heroTitleEm, 'proof');
    assert.equal(landing.heroTitleBefore, 'Graduate with\n');
    assert.match(landing.heroLede, /Tool-first programs/);
    assert.equal(landing.faq1Question, 'Who are Gradflow courses for?');
    assert.deepEqual(landing.marqueeItems, ['VIT', 'MIT', 'SRM', 'Manipal', 'Amity', 'Christ']);
  });

  it('merges admin edits and strips HTML', () => {
    const landing = parseLanding({
      heroLede: '<script>alert(1)</script>Build with proof.',
      marqueeItems: 'NIT, BITS,  ',
      announcement: '',
    });
    assert.equal(landing.heroLede, 'Build with proof.');
    assert.equal(landing.heroTitleEm, 'proof');
    assert.deepEqual(landing.marqueeItems, ['NIT', 'BITS']);
    assert.equal(landing.announcement, 'New learning paths appear here when you publish them');
  });

  it('parses jsonb strings from site settings', () => {
    const landing = parseLanding(JSON.stringify({ heroCta: 'Browse paths' }));
    assert.equal(landing.heroCta, 'Browse paths');
  });

  it('keeps designed line breaks in heading fields', () => {
    const landing = parseLanding({ heroTitleBefore: 'Graduate with\n' });
    assert.equal(landing.heroTitleBefore, 'Graduate with\n');
  });

  it('returns landing copy from public-config', async () => {
    const result = await createHandlers({ env: {} }).publicConfig();
    assert.equal(result.status, 200);
    assert.equal(result.body.announcement, '');
    assert.equal(result.body.landing.heroTitleEm, 'proof');
  });

  it('lets admins edit landing copy in the workspace', () => {
    const admin = readFileSync(path.join(ROOT, 'admin/admin.js'), 'utf8');
    const nav = readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
    const home = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(nav, /data-view="landing"/);
    assert.match(admin, /\/api\/admin\/landing/);
    assert.match(home, /data-landing="heroLede"/);
    assert.match(app, /function applyLanding/);
  });
});
