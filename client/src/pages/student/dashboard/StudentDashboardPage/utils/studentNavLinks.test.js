import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studentNavLinks } from './studentNavLinks.js';

const sourceRoot = new URL('../../../../../', import.meta.url);

test('the student dashboard offers SkillPath directly after Standards', () => {
  const index = studentNavLinks.findIndex((item) => item.labelKey === 'practice');
  const skillpath = studentNavLinks[index + 1];
  assert.equal(skillpath.labelKey, 'skillpath');
  assert.equal(skillpath.path, '/portal/skillpath');
  assert.equal(skillpath.section, 'practice');
  assert.equal(typeof skillpath.icon, 'function');
  assert.equal(skillpath.feature, undefined);
  assert.equal(skillpath.liveLessons, undefined);
  assert.equal(studentNavLinks.filter((item) => item.path === skillpath.path).length, 1);
});

test('the SkillPath card has English and Arabic labels and descriptions', () => {
  for (const language of ['en', 'ar']) {
    const locale = JSON.parse(readFileSync(new URL(`i18n/locales/${language}/layout.sidebar.json`, sourceRoot), 'utf8'));
    assert.ok(locale.items.skillpath?.trim(), `${language} label`);
    assert.ok(locale.studentDashboard.descriptions.skillpath?.trim(), `${language} description`);
  }
});
