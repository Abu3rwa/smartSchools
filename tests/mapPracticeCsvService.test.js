import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMapPracticeCsv, normalizeMapPracticePlanTitle, extractMapPracticeStudentIdFromFilename } from '../services/mapPracticeCsvService.js';

test('parseMapPracticeCsv handles headers and quoted multiline values', () => {
  const csv = [
    'student_id,plan_title,set_id,set_title,set_order,question_id,order,subject,strand,skill_code,skill_name,rit_band,passage_id,passage_title,passage_text,question_type,stem,option_a,option_b,option_c,option_d,correct_answer,explanation,distractor_note,points',
    'S-000253,Spring Focus,SET-1,Context clues,1,Q-100,1,Reading,Vocabulary,VOC-CONTEXT,Context clues,201-210,P-1,"A passage","This is a story with a *title*.",mcq,"What does the word *keen* suggest?","bright","confused","careful","excited","B","It means very attentive.","Try to remember the clue.",1'
  ].join('\n');

  const parsed = parseMapPracticeCsv(csv, 'S-000253_spring-focus.csv');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.fileStudentId, 'S-000253');
  assert.equal(parsed.validation[0].validSkillCode, true);
  assert.equal(parsed.validation[0].questionType, 'mcq');
});

test('extractMapPracticeStudentIdFromFilename handles common naming patterns', () => {
  assert.equal(extractMapPracticeStudentIdFromFilename('S-000253_fall-map-01.csv'), 'S-000253');
  assert.equal(normalizeMapPracticePlanTitle('', 'MAP Practice Default'), 'MAP Practice Default');
});
