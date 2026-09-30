import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import Student from '../models/Student.js';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import { mapPracticeCsvHeader } from '../validators/mapPracticeValidators.js';
import { buildMapPracticeOverviewSummary } from '../controllers/mapPracticeImportController.js';
import { getMapPracticeImportAction } from '../client/src/pages/mapTestPrep/mapPracticeImportState.js';
import { getMapPracticeSetProgress } from '../client/src/pages/student/mapTestPrep/studentMapPracticeProgress.js';
import {
  importMapPracticeFiles,
  resolveMapPracticeStudentMatch,
  buildMapPracticePreview,
  validateMapPracticeImportToken
} from '../services/mapPracticeImportService.js';

test('resolveMapPracticeStudentMatch marks unresolved IDs as needs_student and never invents a match', async () => {
  const originalFindOne = Student.findOne;
  try {
    Student.findOne = async ({ school, studentId }) => {
      if (school === 'school-1' && studentId === 'V-002') {
        return { _id: 'student-v002', studentId: 'V-002', firstName: 'Yousef', lastName: 'Nassar', currentClass: 'class-1' };
      }
      return null;
    };

    const result = await resolveMapPracticeStudentMatch({ schoolId: 'school-1', csvStudentId: 'S-000253', filenameStudentId: 'S-000253', selectedStudentId: null });

    assert.equal(result.status, 'needs_student');
    assert.equal(result.csvStudentId, 'S-000253');
    assert.equal(result.matchedBy, null);
    assert.equal(result.student, null);
    assert.equal(result.message, 'We couldn\'t find a student with ID S-000253 in this school. Choose the student this file belongs to.');
  } finally {
    Student.findOne = originalFindOne;
  }
});

test('resolveMapPracticeStudentMatch blocks conflicting manual override when CSV already matches a student', async () => {
  const originalFindOne = Student.findOne;
  try {
    Student.findOne = async ({ school, studentId }) => {
      if (school === 'school-1' && studentId === 'V-002') {
        return { _id: 'student-v002', studentId: 'V-002', firstName: 'Yousef', lastName: 'Nassar', currentClass: 'class-1' };
      }
      if (school === 'school-1' && studentId === 'S-999999') {
        return { _id: 'student-s999', studentId: 'S-999999', firstName: 'Ali', lastName: 'Khan', currentClass: 'class-2' };
      }
      return null;
    };

    await assert.rejects(
      () => resolveMapPracticeStudentMatch({ schoolId: 'school-1', csvStudentId: 'V-002', filenameStudentId: 'S-000253', selectedStudentId: 'S-999999' }),
      /Conflicting student override/i
    );
  } finally {
    Student.findOne = originalFindOne;
  }
});

test('resolveMapPracticeStudentMatch accepts a Mongo ID override only when no file ID matched', async () => {
  const originalFindOne = Student.findOne;
  try {
    Student.findOne = async (filter) => {
      if (filter._id === 'student-manual' && filter.academicYear === '2026-2027') {
        return { _id: 'student-manual', studentId: 'S-000264', firstName: 'Mina', lastName: 'Ali', currentClass: 'class-1' };
      }
      return null;
    };

    const result = await resolveMapPracticeStudentMatch({
      schoolId: 'school-1',
      csvStudentId: 'S-000253',
      filenameStudentId: 'S-000253',
      selectedStudentId: 'student-manual',
      academicYear: '2026-2027'
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.matchedBy, 'manual');
    assert.equal(result.csvStudentId, 'S-000253');
    assert.equal(result.student.studentId, 'S-000264');
  } finally {
    Student.findOne = originalFindOne;
  }
});

test('buildMapPracticePreview returns ready status when the student is resolved and a token is created for commit validation', async () => {
  const originalFindOne = Student.findOne;
  try {
    Student.findOne = async ({ school, studentId }) => {
      if (school === 'school-1' && studentId === 'V-002') {
        return { _id: 'student-v002', studentId: 'V-002', firstName: 'Yousef', lastName: 'Nassar', currentClass: 'class-1' };
      }
      return null;
    };

    const preview = await buildMapPracticePreview({
      schoolId: 'school-1',
      fileName: 'V-002_fall-map-01.csv',
      fileBuffer: Buffer.from('student_id,plan_title,set_id,set_title,set_order,question_id,order,subject,strand,skill_code,skill_name,rit_band,passage_id,passage_title,passage_text,question_type,stem,option_a,option_b,option_c,option_d,correct_answer,explanation,distractor_note,points\nV-002,Fall Focus,SET-1,Vocabulary,1,Q-1,1,Reading,Vocabulary,READ-1,Context,201-210,P-1,Passage,The text,mcq,What does it mean?,A,B,C,D,B,Reason,Note,1\n'),
      existingToken: null
    });

    assert.equal(preview.status, 'ready');
    assert.equal(preview.student?.studentId, 'V-002');
    assert.equal(preview.matchedBy, 'csv');
    assert.ok(preview.token);
    assert.ok(preview.tokenExpiresAt);
    assert.ok(await validateMapPracticeImportToken({ token: preview.token, fileHashes: [preview.fileHash] }));
  } finally {
    Student.findOne = originalFindOne;
  }
});

test('buildMapPracticePreview reports needs_student for an unknown CSV ID', async () => {
  const originalStudentFindOne = Student.findOne;
  const originalSkillFind = MapPracticeSkill.find;
  try {
    Student.findOne = async () => null;
    MapPracticeSkill.find = () => ({ select: () => ({ lean: async () => [] }) });
    const csv = `${mapPracticeCsvHeader.join(',')}\nS-000253,Fall Focus,SET-1,Set 1,1,Q-1,1,Reading,Vocabulary,VOC-1,Context,201-210,P-1,Passage,Text,mcq,Question,A,B,C,D,A,Explanation,,1\n`;
    const preview = await buildMapPracticePreview({ schoolId: 'school-1', fileName: 'S-000253_fall-map-01.csv', fileBuffer: Buffer.from(csv) });

    assert.equal(preview.status, 'needs_student');
    assert.equal(preview.csvStudentId, 'S-000253');
    assert.equal(preview.student, null);
    assert.match(preview.message, /couldn't find a student with ID S-000253/);
  } finally {
    Student.findOne = originalStudentFindOne;
    MapPracticeSkill.find = originalSkillFind;
  }
});

test('buildMapPracticePreview becomes ready after a Mongo-ID student pick and preserves CSV ID', async () => {
  const originalStudentFindOne = Student.findOne;
  const originalSkillFind = MapPracticeSkill.find;
  try {
    Student.findOne = async (filter) => {
      if (filter._id === 'student-picked' && filter.academicYear === '2026-2027') {
        return { _id: 'student-picked', studentId: 'S-000264', firstName: 'Mina', lastName: 'Ali', currentClass: 'class-1' };
      }
      return null;
    };
    MapPracticeSkill.find = () => ({ select: () => ({ lean: async () => [] }) });
    const csv = `${mapPracticeCsvHeader.join(',')}\nS-000253,Fall Focus,SET-1,Set 1,1,Q-1,1,Reading,Vocabulary,VOC-1,Context,201-210,P-1,Passage,Text,mcq,Question,A,B,C,D,A,Explanation,,1\n`;
    const preview = await buildMapPracticePreview({ schoolId: 'school-1', fileName: 'S-000253_fall-map-01.csv', fileBuffer: Buffer.from(csv), overrideStudentId: 'student-picked', academicYear: '2026-2027' });

    assert.equal(preview.status, 'ready');
    assert.equal(preview.matchedBy, 'manual');
    assert.equal(preview.student.studentId, 'S-000264');
    assert.equal(preview.csvStudentId, 'S-000253');
  } finally {
    Student.findOne = originalStudentFindOne;
    MapPracticeSkill.find = originalSkillFind;
  }
});

test('buildMapPracticePreview summarizes 210 questions into the expected sets, skills, types, and passages', async () => {
  const originalStudentFindOne = Student.findOne;
  const originalPlanFindOne = MapPracticePlan.findOne;
  const originalQuestionFind = MapPracticeQuestion.find;
  const originalSkillFind = MapPracticeSkill.find;
  try {
    Student.findOne = async (filter) => filter.studentId === 'S-000253'
      ? { _id: 'student-1', studentId: 'S-000253', firstName: 'Mina', lastName: 'Ali', currentClass: 'class-1' }
      : null;
    MapPracticePlan.findOne = async () => null;
    MapPracticeQuestion.find = () => ({ select: () => ({ lean: async () => [] }) });
    MapPracticeSkill.find = () => ({ select: () => ({ lean: async () => [] }) });
    const rows = Array.from({ length: 210 }, (_, index) => {
      const setNumber = Math.floor(index / 15) + 1;
      const values = Object.fromEntries(mapPracticeCsvHeader.map((header) => [header, '']));
      Object.assign(values, {
        student_id: 'S-000253', plan_title: 'Fall Focus', set_id: `SET-${setNumber}`, set_title: `Set ${setNumber}`,
        set_order: String(setNumber), question_id: `Q-${index + 1}`, order: String(index + 1), subject: 'Reading',
        strand: 'Vocabulary', skill_code: `VOC-${setNumber}`, skill_name: `Skill ${setNumber}`, rit_band: '201-210',
        passage_id: `P-${Math.floor(index / 70) + 1}`, passage_title: `Passage ${Math.floor(index / 70) + 1}`,
        question_type: index < 170 ? 'mcq' : index < 185 ? 'multi_select' : 'short_text', stem: `Question ${index + 1}`,
        option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_answer: 'A', explanation: 'Because', points: '1'
      });
      return mapPracticeCsvHeader.map((header) => values[header]).join(',');
    });
    const csv = `${mapPracticeCsvHeader.join(',')}\n${rows.join('\n')}\n`;
    const preview = await buildMapPracticePreview({ schoolId: 'school-1', fileName: 'S-000253_fall-map-01.csv', fileBuffer: Buffer.from(csv) });

    assert.equal(preview.rows, 210);
    assert.equal(preview.sets.length, 14);
    assert.equal(preview.skills.length, 14);
    assert.equal(preview.passages, 3);
    assert.deepEqual(preview.questionTypes, { mcq: 170, multi_select: 15, short_text: 25 });
    assert.equal(preview.willCreate, 210);
    assert.equal(preview.willUpdate, 0);

    MapPracticePlan.findOne = async () => ({ _id: 'existing-plan' });
    MapPracticeQuestion.find = () => ({ select: () => ({ lean: async () => Array.from({ length: 210 }, (_, index) => ({ questionId: `Q-${index + 1}` })) }) });
    const repeatPreview = await buildMapPracticePreview({ schoolId: 'school-1', fileName: 'S-000253_fall-map-01.csv', fileBuffer: Buffer.from(csv) });
    assert.equal(repeatPreview.willCreate, 0);
    assert.equal(repeatPreview.willUpdate, 210);
    assert.equal(repeatPreview.notInNewFile, 0);
  } finally {
    Student.findOne = originalStudentFindOne;
    MapPracticePlan.findOne = originalPlanFindOne;
    MapPracticeQuestion.find = originalQuestionFind;
    MapPracticeSkill.find = originalSkillFind;
  }
});

test('importMapPracticeFiles creates a plan and tracks school-scoped skills without AI', async () => {
  const originalStudentFindOne = Student.findOne;
  const originalSkillFindOneAndUpdate = MapPracticeSkill.findOneAndUpdate;
  const originalPlanFindOneAndUpdate = MapPracticePlan.findOneAndUpdate;
  const originalPlanSkillFindOneAndUpdate = MapPracticePlanSkill.findOneAndUpdate;
  const originalSetFindOneAndUpdate = MapPracticeSet.findOneAndUpdate;
  const originalSetFindByIdAndUpdate = MapPracticeSet.findByIdAndUpdate;
  const originalQuestionFindOneAndUpdate = MapPracticeQuestion.findOneAndUpdate;
  const originalQuestionCountDocuments = MapPracticeQuestion.countDocuments;
  const originalBatchCreate = MapPracticeImportBatch.create;
  let planWrite = null;
  const upsertWrites = [];

  try {
    Student.findOne = () => ({
      lean: async () => ({
        _id: 'student-1',
        studentId: 'S-000253',
        currentClass: 'class-1'
      })
    });

    MapPracticeSkill.findOneAndUpdate = async (_filter, update) => {
      upsertWrites.push(update);
      return { _id: 'skill-1', wasNew: true, ...update.$setOnInsert, ...update.$set };
    };

    MapPracticePlan.findOneAndUpdate = async (_filter, update) => {
      planWrite = update;
      return { _id: 'plan-1', ...update.$setOnInsert, ...update.$set };
    };

    MapPracticePlanSkill.findOneAndUpdate = async (_filter, update) => {
      upsertWrites.push(update);
      return { _id: 'plan-skill-1', ...update.$setOnInsert, ...update.$set };
    };

    MapPracticeSet.findOneAndUpdate = async (_filter, update) => {
      upsertWrites.push(update);
      return { _id: 'set-1', ...update.$setOnInsert, ...update.$set };
    };

    MapPracticeSet.findByIdAndUpdate = async () => ({ _id: 'set-1' });
    MapPracticeQuestion.findOneAndUpdate = async (_filter, update) => ({
      _id: 'question-1',
      ...update.$set
    });
    MapPracticeQuestion.countDocuments = async () => 1;
    MapPracticeImportBatch.create = async (doc) => ({ _id: 'batch-1', ...doc });

    const result = await importMapPracticeFiles({
      schoolId: '68c4d166ef9ee9d40512d3ad',
      userId: '68c4d166ef9ee9d40512d3ae',
      mode: 'skip_errors',
      files: [{
        fileName: 'S-000253_fall-map.csv',
        studentId: 'S-000253',
        decisions: { matchedStudentId: 'S-000253', errors: [], warnings: [] },
        rows: [{
          rowNumber: 2,
          values: {
            student_id: 'S-000253',
            plan_title: 'Fall Focus',
            set_id: 'SET-1',
            set_title: 'Vocabulary',
            set_order: '1',
            question_id: 'Q-1',
            order: '1',
            subject: 'Reading',
            strand: 'Vocabulary',
            skill_code: 'VOC-CONTEXT',
            skill_name: 'Context clues',
            rit_band: '201-210',
            passage_id: 'P-1',
            passage_title: 'A passage',
            passage_text: 'A short passage.',
            question_type: 'mcq',
            stem: 'What does the word mean?',
            option_a: 'large',
            option_b: 'small',
            option_c: 'bright',
            option_d: 'quiet',
            correct_answer: 'B',
            explanation: 'It means something else.',
            distractor_note: 'Be careful.',
            points: '1'
          }
        }]
      }]
    });

    assert.ok(result.summary);
    assert.equal(result.summary.files, 1);
    assert.ok(Array.isArray(result.newSkillsCreated));
    assert.equal(result.newSkillsCreated[0], 'VOC-CONTEXT');
    assert.equal(planWrite.$set.sourceStudentId, 'S-000253');
    assert.deepEqual(Object.keys(planWrite.$setOnInsert).filter((path) => Object.hasOwn(planWrite.$set, path)), []);
    assert.ok(upsertWrites.every((update) => Object.keys(update.$setOnInsert).every((path) => !Object.hasOwn(update.$set, path))));
  } finally {
    Student.findOne = originalStudentFindOne;
    MapPracticeSkill.findOneAndUpdate = originalSkillFindOneAndUpdate;
    MapPracticePlan.findOneAndUpdate = originalPlanFindOneAndUpdate;
    MapPracticePlanSkill.findOneAndUpdate = originalPlanSkillFindOneAndUpdate;
    MapPracticeSet.findOneAndUpdate = originalSetFindOneAndUpdate;
    MapPracticeSet.findByIdAndUpdate = originalSetFindByIdAndUpdate;
    MapPracticeQuestion.findOneAndUpdate = originalQuestionFindOneAndUpdate;
    MapPracticeQuestion.countDocuments = originalQuestionCountDocuments;
    MapPracticeImportBatch.create = originalBatchCreate;
  }
});

test('importMapPracticeFiles replays a completed commit token without importing again', async () => {
  const originalFindOne = MapPracticeImportBatch.findOne;
  try {
    const existingBatch = { _id: 'batch-existing', summary: { files: 1, created: 0, updated: 210, skipped: 0, errors: 0 }, newSkillsCreated: [] };
    MapPracticeImportBatch.findOne = () => ({ lean: async () => existingBatch });

    const result = await importMapPracticeFiles({ schoolId: 'school-1', userId: 'user-1', files: [], idempotencyKey: 'preview-token' });
    assert.equal(result.replayed, true);
    assert.equal(result.batch._id, 'batch-existing');
    assert.equal(result.summary.updated, 210);
  } finally {
    MapPracticeImportBatch.findOne = originalFindOne;
  }
});

test('overview student total counts the whole scoped roster, not only students with plans', () => {
  const summary = buildMapPracticeOverviewSummary({
    students: [{ _id: 'student-1' }, { _id: 'student-2' }, { _id: 'student-3' }],
    plans: [{ student: 'student-1' }],
    pendingReviewItems: 2,
    assignments: 4
  });

  assert.equal(summary.students, 3);
  assert.equal(summary.withPlan, 1);
  assert.equal(summary.waitingForReview, 2);
});

test('import action reflects exact blocking reasons and skip-errors readiness', () => {
  assert.equal(getMapPracticeImportAction({ phase: 'previewing' }).reasonKey, 'checking');
  assert.equal(getMapPracticeImportAction({ phase: 'previewReady', files: [{ status: 'needs_student' }], token: 'token' }).reasonKey, 'chooseStudentReason');
  assert.equal(getMapPracticeImportAction({ phase: 'previewReady', files: [{ status: 'has_errors', rows: 2, errors: [{}, {}] }], token: 'token' }).values.count, 2);
  assert.equal(getMapPracticeImportAction({ phase: 'previewReady', files: [{ status: 'has_errors', rows: 2, errors: [{}] }], errorMode: 'skip', token: 'token' }).disabled, false);
  assert.equal(getMapPracticeImportAction({ phase: 'error', retryAction: 'commit', files: [{ status: 'ready' }], token: 'token' }).disabled, false);
  assert.equal(getMapPracticeImportAction({ phase: 'error', retryAction: 'preview', files: [{ status: 'ready' }], token: 'token' }).reasonKey, 'previewRequired');
});

test('student set progress counts only saved nonempty responses', () => {
  const emptyAttempt = { set: 'set-1', answers: [{ question: 'q-1', response: '' }, { question: 'q-2', response: [] }] };
  const savedAttempt = { set: 'set-1', answers: [{ question: 'q-1', response: 'A' }, { question: 'q-2', response: [] }, { question: 'q-1', response: 'A' }] };

  assert.deepEqual(getMapPracticeSetProgress([emptyAttempt], 'set-1', 10), { answered: 0, total: 10, percentage: 0 });
  assert.deepEqual(getMapPracticeSetProgress([savedAttempt], 'set-1', 10), { answered: 1, total: 10, percentage: 10 });
  assert.deepEqual(getMapPracticeSetProgress([], 'set-1', 0), { answered: 0, total: 0, percentage: 0 });
});
