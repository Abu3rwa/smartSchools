import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import Student from '../models/Student.js';
import { normalizeSkillCode, isValidSkillCode, mapPracticeQuestionTypeSchema } from '../validators/mapPracticeValidators.js';

const getAcademicYear = () => {
  const current = new Date();
  const year = current.getFullYear();
  return `${year}-${String(year + 1).slice(-2)}`;
};

const getNormalizedPlanTitle = (rawValue, fallback) => {
  const title = String(rawValue || '').trim();
  return title || fallback || 'MAP Practice';
};

const safeNumber = (value, fallback = 1) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const importMapPracticeFiles = async ({ schoolId, userId, files, mode = 'stop_on_error' }) => {
  const batchSummary = {
    files: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };

  const newSkillsCreated = [];
  const batchFiles = [];

  for (const file of files || []) {
    const fileName = String(file?.fileName || 'uploaded.csv');
    const matchedStudentId = String(file?.decisions?.matchedStudentId || file?.studentId || '').trim();
    const studentDoc = matchedStudentId
      ? await Student.findOne({ school: schoolId, studentId: matchedStudentId, status: 'active' }).lean()
      : null;

    if (!studentDoc) {
      batchSummary.errors += 1;
      batchSummary.skipped += 1;
      batchFiles.push({ name: fileName, studentId: matchedStudentId, rows: 0, created: 0, updated: 0, skipped: 0, errors: 1, status: 'failed' });
      if (mode === 'stop_on_error') throw new Error(`Student ${matchedStudentId || 'unknown'} could not be resolved for ${fileName}.`);
      continue;
    }

    const rows = Array.isArray(file?.rows) ? file.rows : [];
    const summary = { name: fileName, studentId: studentDoc.studentId, rows: rows.length, created: 0, updated: 0, skipped: 0, errors: 0, status: 'imported' };
    const planTitle = getNormalizedPlanTitle((rows[0]?.values?.plan_title || rows[0]?.original?.plan_title || ''), fileName);
    const normalizedPlanTitle = planTitle.toLowerCase();
    const academicYear = getAcademicYear();

    const plan = await MapPracticePlan.findOneAndUpdate(
      { school: schoolId, student: studentDoc._id, normalizedTitle: normalizedPlanTitle },
      {
        $setOnInsert: {
          school: schoolId,
          student: studentDoc._id,
          class: studentDoc.currentClass || null,
          academicYear,
          title: planTitle,
          normalizedTitle: normalizedPlanTitle,
          status: 'active',
          createdBy: userId,
          createdFromBatch: null
        },
        $set: {
          updatedBy: userId,
          class: studentDoc.currentClass || null,
          academicYear
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const rowsToProcess = rows.filter((row) => {
      const values = row?.values || row?.original || {};
      const hasError = Boolean(file?.decisions?.errors?.length) && mode === 'stop_on_error';
      if (hasError) return false;
      const questionType = String(values.question_type || '').trim().toLowerCase();
      return Boolean(values.question_id) && Boolean(values.skill_code) && Boolean(values.stem) && ['mcq', 'multi_select', 'short_text'].includes(questionType);
    });

    for (const row of rowsToProcess) {
      const values = row?.values || row?.original || {};
      const questionType = String(values.question_type || '').trim().toLowerCase();
      const validType = mapPracticeQuestionTypeSchema.safeParse(questionType);
      const skillCode = normalizeSkillCode(values.skill_code);
      const skillName = String(values.skill_name || skillCode).trim();

      if (!validType.success || !isValidSkillCode(skillCode)) {
        summary.errors += 1;
        summary.skipped += 1;
        if (mode === 'stop_on_error') throw new Error(`Invalid question type or skill code in ${fileName} for row ${row.rowNumber || 1}.`);
        continue;
      }

      const skillRecord = await MapPracticeSkill.findOneAndUpdate(
        { school: schoolId, code: skillCode },
        {
          $setOnInsert: {
            school: schoolId,
            code: skillCode,
            name: skillName,
            subject: String(values.subject || '').trim(),
            strand: String(values.strand || '').trim(),
            description: String(values.explanation || '').trim(),
            createdBy: userId
          },
          $set: {
            name: skillName,
            subject: String(values.subject || '').trim(),
            strand: String(values.strand || '').trim(),
            description: String(values.explanation || '').trim(),
            updatedBy: userId
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (skillRecord?.wasNew) {
        newSkillsCreated.push(skillCode);
      }

      await MapPracticePlanSkill.findOneAndUpdate(
        { school: schoolId, plan: plan._id, skill: skillRecord._id },
        {
          $setOnInsert: {
            school: schoolId,
            plan: plan._id,
            student: studentDoc._id,
            skill: skillRecord._id,
            status: 'active',
            targetAccuracy: 80,
            teacherNote: ''
          },
          $set: {
            status: 'active',
            targetAccuracy: 80
          }
        },
        { upsert: true, new: true }
      );

      const setId = String(values.set_id || 'default-set');
      const setTitle = String(values.set_title || setId).trim();
      const setDoc = await MapPracticeSet.findOneAndUpdate(
        { school: schoolId, plan: plan._id, setId },
        {
          $setOnInsert: {
            school: schoolId,
            plan: plan._id,
            student: studentDoc._id,
            setId,
            title: setTitle,
            order: safeNumber(values.set_order, 0),
            questionCount: 0,
            estimatedMinutes: 10,
            status: 'available',
            createdBy: userId
          },
          $set: {
            title: setTitle,
            order: safeNumber(values.set_order, 0),
            questionCount: 0
          }
        },
        { upsert: true, new: true }
      );

      const questionId = String(values.question_id || '').trim();
      const questionPayload = {
        school: schoolId,
        plan: plan._id,
        student: studentDoc._id,
        set: setDoc._id,
        questionId,
        skill: skillRecord._id,
        subject: String(values.subject || '').trim(),
        strand: String(values.strand || '').trim(),
        ritBand: String(values.rit_band || '').trim(),
        passageId: String(values.passage_id || '').trim(),
        passageTitle: String(values.passage_title || '').trim(),
        passageText: String(values.passage_text || '').trim(),
        questionType: validType.data,
        stem: String(values.stem || '').trim(),
        options: [
          { key: 'A', text: String(values.option_a || '').trim() },
          { key: 'B', text: String(values.option_b || '').trim() },
          { key: 'C', text: String(values.option_c || '').trim() },
          { key: 'D', text: String(values.option_d || '').trim() }
        ].filter((option) => option.text),
        correctAnswer: String(values.correct_answer || '').trim(),
        explanation: String(values.explanation || '').trim(),
        distractorNote: String(values.distractor_note || '').trim(),
        points: safeNumber(values.points, 1),
        order: safeNumber(values.order, 0),
        active: true,
        contentHash: `${skillCode}:${questionId}:${String(values.stem || '').trim()}`
      };

      const questionRecord = await MapPracticeQuestion.findOneAndUpdate(
        { school: schoolId, plan: plan._id, questionId },
        { $set: questionPayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await MapPracticeSet.findByIdAndUpdate(setDoc._id, { $set: { questionCount: await MapPracticeQuestion.countDocuments({ school: schoolId, plan: plan._id, set: setDoc._id }) } });

      if (questionRecord) {
        summary.created += 1;
      }
    }

    batchFiles.push({
      name: fileName,
      studentId: studentDoc.studentId,
      rows: summary.rows,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors,
      status: summary.errors > 0 && mode === 'skip_errors' ? 'partial' : 'imported'
    });

    batchSummary.files += 1;
    batchSummary.created += summary.created;
    batchSummary.updated += summary.updated;
    batchSummary.skipped += summary.skipped;
    batchSummary.errors += summary.errors;
  }

  const batchRecord = await MapPracticeImportBatch.create({
    school: schoolId,
    importedBy: userId,
    files: batchFiles,
    newSkillsCreated,
    mode,
    summary: {
      files: batchSummary.files,
      created: batchSummary.created,
      updated: batchSummary.updated,
      skipped: batchSummary.skipped,
      errors: batchSummary.errors
    }
  });

  return { batch: batchRecord, summary: batchSummary, newSkillsCreated };
};
