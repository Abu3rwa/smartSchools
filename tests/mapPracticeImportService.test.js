import test from 'node:test';
import assert from 'node:assert/strict';
import Student from '../models/Student.js';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import { importMapPracticeFiles } from '../services/mapPracticeImportService.js';

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

  try {
    Student.findOne = () => ({
      lean: async () => ({
        _id: 'student-1',
        studentId: 'S-000253',
        currentClass: 'class-1'
      })
    });

    MapPracticeSkill.findOneAndUpdate = async (_filter, update, _opts) => ({
      _id: 'skill-1',
      wasNew: true,
      ...update.$setOnInsert,
      ...update.$set
    });

    MapPracticePlan.findOneAndUpdate = async (_filter, update, _opts) => ({
      _id: 'plan-1',
      ...update.$setOnInsert,
      ...update.$set
    });

    MapPracticePlanSkill.findOneAndUpdate = async (_filter, update, _opts) => ({
      _id: 'plan-skill-1',
      ...update.$setOnInsert,
      ...update.$set
    });

    MapPracticeSet.findOneAndUpdate = async (_filter, update, _opts) => ({
      _id: 'set-1',
      ...update.$setOnInsert,
      ...update.$set
    });

    MapPracticeSet.findByIdAndUpdate = async () => ({ _id: 'set-1' });
    MapPracticeQuestion.findOneAndUpdate = async (_filter, update, _opts) => ({
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
