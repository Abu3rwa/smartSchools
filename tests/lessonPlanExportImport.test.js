import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { buildLessonPlanDocx, buildSafeFilename } from '../services/lessonPlanDocxService.js';
import {
  buildImportTemplateCsv,
  parseLessonPlanCsv,
  TEMPLATE_HEADERS,
} from '../services/lessonPlanImportService.js';

const fullPlan = {
  title: 'Fractions <b>intro</b>',
  date: new Date('2026-10-05T00:00:00Z'),
  status: 'draft',
  weekNumber: 5,
  summary: 'Line one\n- bullet a\n- bullet b',
  objectives: [{ text: 'Compare fractions', order: 0 }],
  stages: [{ name: 'Warm-up', procedure: 'Discuss', materials: 'Slides', timing: '10 min' }],
  manualStandards: [{ code: 'M.5.1', name: 'Fractions' }],
  homework: 'Page 12',
};

const readDocumentXml = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
};

test('buildLessonPlanDocx returns a valid docx zip with content (English)', async () => {
  const buffer = await buildLessonPlanDocx(fullPlan, {
    lang: 'en', schoolName: 'AMLY', teacherName: 'Abdulhafeez', className: '5-A', subjectName: 'Math',
  });
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const xml = await readDocumentXml(buffer);
  assert.match(xml, /Fractions intro/);
  assert.match(xml, /Warm-up/);
  assert.match(xml, /Lesson Stages/);
  assert.doesNotMatch(xml, /<b>/);
});

test('buildLessonPlanDocx uses right-to-left layout for Arabic', async () => {
  const buffer = await buildLessonPlanDocx({ ...fullPlan, title: 'الكسور' }, {
    lang: 'ar', schoolName: 'مدرسة', teacherName: 'معلم', className: '5-أ', subjectName: 'رياضيات',
  });
  const xml = await readDocumentXml(buffer);
  assert.match(xml, /الكسور/);
  assert.match(xml, /مراحل الدرس/);
  assert.match(xml, /w:bidi/);
  assert.match(xml, /w:bidiVisual/);
});

test('buildLessonPlanDocx handles a plan with only required fields', async () => {
  const buffer = await buildLessonPlanDocx({ title: 'Minimal', date: new Date() }, { lang: 'en' });
  assert.ok(buffer.length > 1000);
});

test('buildSafeFilename strips unsafe characters', () => {
  const name = buildSafeFilename('a/b:c*?"<>|d', new Date('2026-10-05T00:00:00Z'));
  assert.equal(name, 'a b c d-2026-10-05.docx');
});

test('import template is a BOM-prefixed CSV that parses back with all headers', () => {
  const csv = buildImportTemplateCsv();
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const { rows, headers, error } = parseLessonPlanCsv(csv);
  assert.equal(error, null);
  assert.equal(rows.length, 2);
  assert.deepEqual(headers, TEMPLATE_HEADERS);
  assert.equal(rows[1].title, 'الكسور العادية');
});

test('parseLessonPlanCsv normalises header aliases and handles quoted newlines', () => {
  const csv = 'Title,Date,Class,Subject,Teacher Email,Previous Knowledge\n"Lesson, one",2026-10-05,5-A,Math,t@x.com,"a\nb"\n';
  const { rows, error } = parseLessonPlanCsv(csv);
  assert.equal(error, null);
  assert.equal(rows[0].title, 'Lesson, one');
  assert.equal(rows[0].teacher_email, 't@x.com');
  assert.equal(rows[0].previous_knowledge, 'a\nb');
});

test('parseLessonPlanCsv reports empty files', () => {
  assert.ok(parseLessonPlanCsv('   ').error);
});
