import crypto from 'crypto';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import Student from '../models/Student.js';
import { normalizeSkillCode, isValidSkillCode, mapPracticeQuestionTypeSchema, mapPracticeQuestionTypes, emptyMapPracticeQuestionTypeCounts, parseMatchingPairs, MAP_MATCHING_MIN_PAIRS, MAP_MATCHING_TERM_SEPARATOR, MAP_MATCHING_PAIR_SEPARATOR } from '../validators/mapPracticeValidators.js';
import { parseMapPracticeCsv, extractMapPracticeStudentIdFromFilename } from './mapPracticeCsvService.js';
import { readTypeDefinition } from './assessment/answerFormat.js';
import { buildPassageHash, findAssessmentPassage, normalizePassageText, resolveAssessmentPassage } from './assessment/passageService.js';

const previewTokenStore = new Map();
const TOKEN_TTL_MS = 30 * 60 * 1000;

const getAcademicYear = (academicYear = null) => {
  if (academicYear) return academicYear;
  const current = new Date();
  const year = current.getFullYear();
  return `${year}-${year + 1}`;
};

const getNormalizedPlanTitle = (rawValue, fallback) => {
  const title = String(rawValue || '').trim();
  return title || fallback || 'MAP Practice';
};

const safeNumber = (value, fallback = 1) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeStudentId = (value) => String(value || '').trim();

const MAP_OBJECTIVE_COLUMN_BY_TYPE = {
  matching: 'matching_pairs',
  ordering: 'ordering_items',
  fill_in_blank: 'blank_answers',
  numeric_response: 'numeric_rule'
};

/**
 * One reader for both the preview and the commit pass so a row that previews as valid cannot
 * later be written with a definition the grader cannot read.
 */
const readRowDefinition = ({ values, questionId }) => {
  const questionType = String(values?.question_type || '').trim().toLowerCase();
  if (!Object.hasOwn(MAP_OBJECTIVE_COLUMN_BY_TYPE, questionType)) {
    return { column: null, definition: null, error: null };
  }
  const definition = readTypeDefinition({
    questionType,
    prompt: String(values?.stem || ''),
    columns: values,
    salt: String(questionId || values?.question_id || '')
  });
  return {
    column: MAP_OBJECTIVE_COLUMN_BY_TYPE[questionType],
    definition,
    error: definition.error
      ? {
        column: MAP_OBJECTIVE_COLUMN_BY_TYPE[questionType],
        problem: definition.error,
        fix: `Set ${MAP_OBJECTIVE_COLUMN_BY_TYPE[questionType]} for a ${questionType} question.`
      }
      : null
  };
};

/**
 * A passage id must mean one text. Rows that repeat it are fine; rows that change it are not.
 */
const collectPassageConflicts = (rows) => {
  const byId = new Map();
  const conflicts = [];
  rows.forEach((row) => {
    const values = row?.values || row?.original || {};
    const key = String(values.passage_id || values.passage_title || '').trim();
    const text = normalizePassageText(values.passage_text);
    if (!key || !text) return;
    const hash = buildPassageHash(text);
    const seen = byId.get(key);
    if (!seen) {
      byId.set(key, { hash, firstRow: row.rowNumber || 1 });
      return;
    }
    if (seen.hash !== hash) {
      conflicts.push({
        row: row.rowNumber || 1,
        column: 'passage_text',
        problem: `passage_id "${key}" has different text in row ${seen.firstRow} and row ${row.rowNumber || 1}.`,
        fix: 'Keep one text per passage id, or give this text its own passage_id.'
      });
    }
  });
  return conflicts;
};

const readMatchingPairs = (rawValue) => {
  const { pairs, invalid } = parseMatchingPairs(rawValue);
  if (invalid.length) {
    return {
      pairs: [],
      error: `Matching pairs must each use the 'term${MAP_MATCHING_TERM_SEPARATOR}definition' format, separated by '${MAP_MATCHING_PAIR_SEPARATOR}'.`
    };
  }
  if (pairs.length < MAP_MATCHING_MIN_PAIRS) {
    return { pairs: [], error: `A matching question needs at least ${MAP_MATCHING_MIN_PAIRS} term/definition pairs.` };
  }
  return { pairs };
};

const studentSummary = (studentDoc) => {
  if (!studentDoc) return null;
  return {
    id: studentDoc._id ? String(studentDoc._id) : null,
    name: [studentDoc.firstName, studentDoc.lastName].filter(Boolean).join(' ') || 'Student',
    studentId: studentDoc.studentId,
    className: studentDoc.currentClass && typeof studentDoc.currentClass === 'object' && studentDoc.currentClass.name
      ? studentDoc.currentClass.name
      : null
  };
};

export const findSchoolStudentByStudentId = async ({ schoolId, studentId }) => {
  const resolvedStudentId = normalizeStudentId(studentId);
  if (!resolvedStudentId) return null;

  try {
    let query = Student.findOne({ school: schoolId, studentId: resolvedStudentId, status: 'active' });
    if (typeof query.populate === 'function') query = query.populate('currentClass', 'name');
    const student = await query;
    if (!student) return null;
    if (typeof student.lean === 'function') {
      return student.lean();
    }
    return student;
  } catch {
    return null;
  }
};

const findSchoolStudentByIdentifier = async ({ schoolId, identifier, academicYear = null }) => {
  const value = normalizeStudentId(identifier);
  if (!value) return null;

  try {
    let query = Student.findOne({ _id: value, school: schoolId, status: 'active', ...(academicYear ? { academicYear } : {}) });
    if (typeof query.populate === 'function') query = query.populate('currentClass', 'name');
    const byId = await query;
    if (byId) return typeof byId.lean === 'function' ? byId.lean() : byId;
  } catch {
    // A non-ObjectId picker value may still be a legacy studentId.
  }

  if (academicYear) return null;
  return findSchoolStudentByStudentId({ schoolId, studentId: value });
};

export const resolveMapPracticeStudentMatch = async ({ schoolId, csvStudentId, filenameStudentId, selectedStudentId = null, academicYear = null }) => {
  const csvId = normalizeStudentId(csvStudentId);
  const filenameId = normalizeStudentId(filenameStudentId);
  const overrideId = normalizeStudentId(selectedStudentId);
  const overrideStudent = overrideId
    ? await findSchoolStudentByIdentifier({ schoolId, identifier: overrideId, academicYear })
    : null;

  const csvMatch = csvId ? await findSchoolStudentByStudentId({ schoolId, studentId: csvId }) : null;
  if (csvMatch) {
    if (overrideId && String(overrideStudent?._id || overrideStudent?.studentId) !== String(csvMatch._id || csvMatch.studentId)) {
      throw new Error(`Conflicting student override: the CSV file already matches student ${csvMatch.studentId}, so you cannot override it with ${overrideStudent?.studentId || overrideId}.`);
    }

    return {
      status: 'ready',
      matchedBy: 'csv',
      csvStudentId: csvMatch.studentId,
      student: studentSummary(csvMatch),
      message: null
    };
  }

  const filenameMatch = filenameId ? await findSchoolStudentByStudentId({ schoolId, studentId: filenameId }) : null;
  if (filenameMatch) {
    if (overrideId && String(overrideStudent?._id || overrideStudent?.studentId) !== String(filenameMatch._id || filenameMatch.studentId)) {
      throw new Error(`Conflicting student override: the file name matches student ${filenameMatch.studentId}, so you cannot override it with ${overrideStudent?.studentId || overrideId}.`);
    }

    return {
      status: 'ready',
      matchedBy: 'filename',
      csvStudentId: csvId || filenameMatch.studentId,
      student: studentSummary(filenameMatch),
      message: null
    };
  }

  if (overrideId) {
    const pickedStudent = overrideStudent;
    if (!pickedStudent) {
      throw new Error(`Student ${overrideId} could not be found in this school.`);
    }

    return {
      status: 'ready',
      matchedBy: 'manual',
      csvStudentId: csvId || filenameId || pickedStudent.studentId,
      student: studentSummary(pickedStudent),
      message: null
    };
  }

  const unresolvedId = csvId || filenameId || 'unknown';
  return {
    status: 'needs_student',
    matchedBy: null,
    csvStudentId: csvId || filenameId || '',
    student: null,
    message: `We couldn't find a student with ID ${unresolvedId} in this school. Choose the student this file belongs to.`
  };
};

export const createMapPracticeImportToken = ({ schoolId, fileHashes = [] }) => {
  const normalizedHashes = [...new Set(fileHashes.map((hash) => String(hash || '').trim()).filter(Boolean))].sort();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const payload = JSON.stringify({ schoolId, fileHashes: normalizedHashes, expiresAt: expiresAt.toISOString() });
  const token = crypto.createHash('sha256').update(payload).digest('hex');
  previewTokenStore.set(token, { schoolId, fileHashes: normalizedHashes, expiresAt });
  return { token, tokenExpiresAt: expiresAt.toISOString() };
};

export const validateMapPracticeImportToken = ({ token, fileHashes = [], schoolId = null }) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return false;

  const record = previewTokenStore.get(normalizedToken);
  if (!record) return false;

  if (record.expiresAt.getTime() < Date.now()) {
    previewTokenStore.delete(normalizedToken);
    return false;
  }

  if (schoolId && String(record.schoolId) !== String(schoolId)) {
    return false;
  }

  const normalizedHashes = [...new Set(fileHashes.map((hash) => String(hash || '').trim()).filter(Boolean))].sort();
  const expectedHashes = [...new Set((record.fileHashes || []).map((hash) => String(hash || '').trim()).filter(Boolean))].sort();

  if (normalizedHashes.length !== expectedHashes.length) return false;
  return normalizedHashes.every((hash, index) => hash === expectedHashes[index]);
};

export const buildMapPracticePreview = async ({ schoolId, fileName, fileBuffer, existingToken = null, overrideStudentId = null, academicYear = null }) => {
  if (!fileBuffer) {
    throw new Error('CSV file contents were not provided.');
  }

  const parsed = parseMapPracticeCsv(fileBuffer.toString('utf8'), fileName);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const csvStudentId = String(rows[0]?.values?.student_id || rows[0]?.original?.student_id || '').trim();
  const filenameStudentId = extractMapPracticeStudentIdFromFilename(fileName);

  let message = null;

  let resolved = null;
  try {
    resolved = await resolveMapPracticeStudentMatch({
      schoolId,
      csvStudentId: csvStudentId || '',
      filenameStudentId,
      selectedStudentId: overrideStudentId || null,
      academicYear
    });
  } catch (error) {
    return {
      fileName,
      fileHash: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
      rows: rows.length,
      status: 'has_errors',
      csvStudentId: csvStudentId || filenameStudentId || '',
      matchedBy: null,
      student: null,
      planTitle: getNormalizedPlanTitle((rows[0]?.values?.plan_title || rows[0]?.original?.plan_title || ''), fileName),
      sets: [],
      skills: [],
      questionTypes: emptyMapPracticeQuestionTypeCounts(),
      passages: 0,
      willCreate: rows.length,
      willUpdate: 0,
      notInNewFile: 0,
      errors: [{ row: 1, column: 'student_id', problem: error.message, fix: 'Choose a valid student or remove the conflicting override.' }],
      warnings: [],
      token: null,
      tokenExpiresAt: null,
      message: error.message
    };
  }

  message = resolved.message;

  const setMap = new Map();
  const skillMap = new Map();
  const questionTypeCounts = emptyMapPracticeQuestionTypeCounts();
  const passages = new Set();
  const passageCarriers = new Set();
  const passageCitations = [];
  const errors = [];
  const warnings = [];

  for (const row of rows) {
    const values = row?.values || row?.original || {};
    const rowNumber = row.rowNumber || 1;
    const questionType = String(values.question_type || '').trim().toLowerCase();
    const skillCode = normalizeSkillCode(values.skill_code);

    if (!values.student_id) {
      errors.push({ row: rowNumber, column: 'student_id', problem: 'Missing student_id value.', fix: 'Add the student_id column to this file.' });
    }

    if (!values.question_id) {
      errors.push({ row: rowNumber, column: 'question_id', problem: 'Missing question_id value.', fix: 'Add a unique question ID for each row.' });
    }

    if (!values.stem) {
      errors.push({ row: rowNumber, column: 'stem', problem: 'Missing question text.', fix: 'Add the question text to the stem column.' });
    }

    if (!skillCode || !isValidSkillCode(skillCode)) {
      errors.push({ row: rowNumber, column: 'skill_code', problem: `Skill code is invalid: ${values.skill_code || ''}`, fix: 'Use a valid skill code like READ-2 or VOC-1.' });
    }

    if (!mapPracticeQuestionTypes.includes(questionType)) {
      errors.push({ row: rowNumber, column: 'question_type', problem: `Unsupported question type: ${values.question_type || ''}`, fix: `Set question_type to one of: ${mapPracticeQuestionTypes.join(', ')}.` });
    }

    if (questionType === 'matching') {
      const matching = readMatchingPairs(values.matching_pairs);
      if (matching.error) {
        errors.push({ row: rowNumber, column: 'matching_pairs', problem: matching.error, fix: `Add at least ${MAP_MATCHING_MIN_PAIRS} pairs as term${MAP_MATCHING_TERM_SEPARATOR}definition, separated by '${MAP_MATCHING_PAIR_SEPARATOR}'.` });
      }
    }

    if (['ordering', 'fill_in_blank', 'numeric_response'].includes(questionType)) {
      const { error } = readRowDefinition({ values, questionId: values.question_id });
      if (error) errors.push({ row: rowNumber, ...error });
    }

    if (values.passage_id || values.passage_title) {
      passages.add(String(values.passage_id || values.passage_title || 'unassigned'));
    }

    const passageKey = String(values.passage_id || values.passage_title || '').trim();
    if (passageKey && String(values.passage_text || '').trim()) passageCarriers.add(passageKey);
    else if (passageKey) passageCitations.push({ rowNumber, passageKey });

    const setId = String(values.set_id || 'default-set').trim() || 'default-set';
    const setTitle = String(values.set_title || setId).trim() || setId;
    if (!setMap.has(setId)) {
      setMap.set(setId, { setId, title: setTitle, questionCount: 0 });
    }
    setMap.get(setId).questionCount += 1;

    if (skillCode) {
      if (!skillMap.has(skillCode)) {
        skillMap.set(skillCode, { code: skillCode, name: String(values.skill_name || skillCode).trim() || skillCode, questionCount: 0, isNew: true, similarTo: null });
      }
      skillMap.get(skillCode).questionCount += 1;
    }

    if (Object.hasOwn(questionTypeCounts, questionType)) {
      questionTypeCounts[questionType] = (questionTypeCounts[questionType] || 0) + 1;
    }
  }

  errors.push(...collectPassageConflicts(rows));

  passageCitations
    .filter((citation) => !passageCarriers.has(citation.passageKey))
    .forEach((citation) => warnings.push({
      row: citation.rowNumber,
      column: 'passage_text',
      message: `Row ${citation.rowNumber} cites passage_id "${citation.passageKey}" without passage_text, so it only imports when that passage is already in the plan.`,
      fix: 'Put the passage text on this row, or import the row that carries it in the same file.'
    }));

  const planTitle = getNormalizedPlanTitle((rows[0]?.values?.plan_title || rows[0]?.original?.plan_title || ''), fileName);
  let willCreate = rows.length;
  let willUpdate = 0;
  let notInNewFile = 0;
  let notInNewQuestionIds = [];
  if (resolved.student?.id) {
    try {
      const existingPlanQuery = MapPracticePlan.findOne({ school: schoolId, student: resolved.student.id, normalizedTitle: planTitle.toLowerCase() });
      const existingPlanResult = await existingPlanQuery;
      const existingPlan = existingPlanResult && typeof existingPlanResult.lean === 'function' ? await existingPlanResult.lean() : existingPlanResult;
      if (existingPlan) {
        const existingQuestionQuery = MapPracticeQuestion.find({ school: schoolId, plan: existingPlan._id }).select('questionId');
        const existingQuestionResult = await existingQuestionQuery.lean();
        const existingIds = new Set(existingQuestionResult.map((question) => String(question.questionId)));
        const incomingIds = new Set(rows.map((row) => String((row.values || row.original || {}).question_id || '')).filter(Boolean));
        willUpdate = rows.filter((row) => existingIds.has(String((row.values || row.original || {}).question_id || ''))).length;
        willCreate = rows.length - willUpdate;
        notInNewQuestionIds = [...existingIds].filter((questionId) => !incomingIds.has(questionId));
        notInNewFile = notInNewQuestionIds.length;
      }
    } catch {
      willCreate = rows.length;
      willUpdate = 0;
      notInNewFile = 0;
      notInNewQuestionIds = [];
    }
  }

  const existingSkillsByCode = new Map();
  if (skillMap.size) {
    try {
      const existingSkillsQuery = MapPracticeSkill.find({ school: schoolId, code: { $in: [...skillMap.keys()] } }).select('code name');
      const existingSkills = await existingSkillsQuery.lean();
      existingSkills.forEach((skill) => existingSkillsByCode.set(skill.code, skill));
    } catch {
      existingSkillsByCode.clear();
    }
  }

  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const tokenRecord = existingToken || createMapPracticeImportToken({ schoolId, fileHashes: [fileHash] });

  const preview = {
    fileName,
    fileHash,
    rows: rows.length,
    status: resolved.status === 'ready' && errors.length === 0 ? 'ready' : resolved.status === 'ready' && errors.length > 0 ? 'has_errors' : resolved.status,
    csvStudentId,
    filenameStudentId,
    matchedBy: resolved.matchedBy,
    student: resolved.student,
    planTitle,
    sets: Array.from(setMap.values()),
    skills: Array.from(skillMap.values()).map((skill) => ({ ...skill, isNew: !existingSkillsByCode.has(skill.code), similarTo: null })),
    questionTypes: questionTypeCounts,
    passages: passages.size,
    willCreate,
    willUpdate,
    notInNewFile,
    notInNewQuestionIds,
    errors,
    warnings,
    token: tokenRecord.token,
    tokenExpiresAt: tokenRecord.tokenExpiresAt,
    message
  };

  if (!resolved.student && !errors.length) {
    preview.status = 'needs_student';
  }

  if (resolved.student && errors.length === 0 && warnings.length > 0) {
    preview.status = 'ready_with_warnings';
  }

  if (resolved.student && errors.length > 0) {
    preview.status = 'has_errors';
  }

  return preview;
};

export const importMapPracticeFiles = async ({ schoolId, userId, files, mode = 'stop_on_error', idempotencyKey = null, academicYear = null }) => {
  if (idempotencyKey) {
    const existingBatchQuery = MapPracticeImportBatch.findOne({ school: schoolId, commitToken: idempotencyKey });
    const existingBatch = await existingBatchQuery;
    const batch = existingBatch && typeof existingBatch.lean === 'function' ? await existingBatch.lean() : existingBatch;
    if (batch) return { batch, summary: batch.summary, newSkillsCreated: batch.newSkillsCreated || [], replayed: true };
  }

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
    const selectedStudentId = String(file?.overrideStudentId || file?.selectedStudentId || file?.decisions?.matchedStudentId || file?.studentId || '').trim();
    const csvStudentId = String(file?.csvStudentId || file?.studentId || '').trim();
    const filenameStudentId = extractMapPracticeStudentIdFromFilename(fileName);

    const resolved = await resolveMapPracticeStudentMatch({
      schoolId,
      csvStudentId,
      filenameStudentId,
      selectedStudentId: selectedStudentId || null,
      academicYear
    });

    if (resolved.status !== 'ready') {
      batchSummary.errors += 1;
      batchSummary.skipped += 1;
      batchFiles.push({ name: fileName, studentId: csvStudentId || filenameStudentId || 'unknown', rows: 0, created: 0, updated: 0, skipped: 0, errors: 1, status: 'failed' });
      if (mode === 'stop_on_error') throw new Error(resolved.message || `Student ${csvStudentId || filenameStudentId || 'unknown'} could not be resolved for ${fileName}.`);
      continue;
    }

    const studentDoc = await findSchoolStudentByStudentId({ schoolId, studentId: resolved.student?.studentId || selectedStudentId || csvStudentId || filenameStudentId });
    if (!studentDoc) {
      batchSummary.errors += 1;
      batchSummary.skipped += 1;
      batchFiles.push({ name: fileName, studentId: csvStudentId || filenameStudentId || 'unknown', rows: 0, created: 0, updated: 0, skipped: 0, errors: 1, status: 'failed' });
      if (mode === 'stop_on_error') throw new Error(`Student ${csvStudentId || filenameStudentId || 'unknown'} could not be resolved for ${fileName}.`);
      continue;
    }

    const rows = Array.isArray(file?.rows) ? file.rows : [];
    const summary = { name: fileName, fileHash: file.fileHash || '', studentId: studentDoc.studentId, studentName: [studentDoc.firstName, studentDoc.lastName].filter(Boolean).join(' '), studentMongoId: studentDoc._id, sourceStudentId: csvStudentId, planId: null, firstSetId: null, rows: rows.length, created: 0, updated: 0, skipped: 0, errors: 0, status: 'imported' };
    if (file?.decisions?.errors?.length && mode === 'stop_on_error') {
      throw new Error(`Fix validation errors before importing ${fileName}.`);
    }
    const planTitle = getNormalizedPlanTitle((rows[0]?.values?.plan_title || rows[0]?.original?.plan_title || ''), fileName);
    const normalizedPlanTitle = planTitle.toLowerCase();
    const planAcademicYear = getAcademicYear(academicYear);

    const plan = await MapPracticePlan.findOneAndUpdate(
      { school: schoolId, student: studentDoc._id, normalizedTitle: normalizedPlanTitle },
      {
        $setOnInsert: {
          school: schoolId,
          student: studentDoc._id,
          title: planTitle,
          normalizedTitle: normalizedPlanTitle,
          status: 'active',
          createdBy: userId,
          createdFromBatch: null
        },
        $set: {
          updatedBy: userId,
          class: studentDoc.currentClass || null,
          academicYear: planAcademicYear,
          sourceStudentId: csvStudentId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    summary.planId = plan._id;

    const rowsToProcess = rows.filter((row) => {
      const values = row?.values || row?.original || {};
      const questionType = String(values.question_type || '').trim().toLowerCase();
      const valid = Boolean(values.question_id) && Boolean(values.skill_code) && Boolean(values.stem)
        && mapPracticeQuestionTypes.includes(questionType)
        && (questionType !== 'matching' || !readMatchingPairs(values.matching_pairs).error)
        && !readRowDefinition({ values, questionId: values.question_id }).error;
      if (!valid) {
        summary.errors += 1;
        summary.skipped += 1;
      }
      return valid;
    });

    // A row may cite a passage by id only, in any order, so read the whole file first.
    const filePassages = new Map();
    rowsToProcess.forEach((row) => {
      const values = row?.values || row?.original || {};
      const key = String(values.passage_id || values.passage_title || '').trim();
      if (key && String(values.passage_text || '').trim() && !filePassages.has(key)) filePassages.set(key, values);
    });

    for (const row of rowsToProcess) {
      const values = row?.values || row?.original || {};
      const questionType = String(values.question_type || '').trim().toLowerCase();
      const validType = mapPracticeQuestionTypeSchema.safeParse(questionType);
      const originalSkillCode = normalizeSkillCode(values.skill_code);
      const skillCode = normalizeSkillCode(file?.useExistingSkill?.[originalSkillCode] || originalSkillCode);
      const skillName = String(values.skill_name || skillCode).trim();

      if (!validType.success || !isValidSkillCode(skillCode)) {
        summary.errors += 1;
        summary.skipped += 1;
        if (mode === 'stop_on_error') throw new Error(`Invalid question type or skill code in ${fileName} for row ${row.rowNumber || 1}.`);
        continue;
      }

      let skillRecord;
      const selectedExistingSkillCode = file?.useExistingSkill?.[originalSkillCode];
      if (selectedExistingSkillCode || file?.createNewSkills?.[originalSkillCode] === false) {
        const selectedSkillCode = selectedExistingSkillCode || skillCode;
        const existingSkillQuery = MapPracticeSkill.findOne({ school: schoolId, code: selectedSkillCode });
        const existingSkill = await existingSkillQuery;
        skillRecord = existingSkill && typeof existingSkill.lean === 'function' ? await existingSkill.lean() : existingSkill;
        if (!skillRecord) {
          summary.errors += 1;
          summary.skipped += 1;
          continue;
        }
      } else {
        skillRecord = await MapPracticeSkill.findOneAndUpdate(
          { school: schoolId, code: skillCode },
          {
            $setOnInsert: {
              school: schoolId,
              code: skillCode,
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
      }

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
      if (!summary.firstSetId) summary.firstSetId = setDoc._id;

      const questionId = String(values.question_id || '').trim();
      let existingQuestion = null;
      try {
        const questionRecord = await MapPracticeQuestion.findOne({ school: schoolId, plan: plan._id, questionId });
        existingQuestion = questionRecord && typeof questionRecord.lean === 'function' ? await questionRecord.lean() : questionRecord || null;
      } catch {
        existingQuestion = null;
      }
      const matching = validType.data === 'matching' ? readMatchingPairs(values.matching_pairs) : { pairs: [] };
      const { definition } = readRowDefinition({ values, questionId });
      const passageKey = String(values.passage_id || values.passage_title || '').trim();
      let passageText = String(values.passage_text || '').trim();
      let passageTitle = String(values.passage_title || '').trim();
      let passageResult = { passage: null, conflict: null, error: null };
      if (passageKey) {
        // A row may cite a passage another row in the same file carries, in either order,
        // or one an earlier import already stored for this plan.
        const carrier = passageText ? values : (filePassages.get(passageKey) || null);
        if (carrier) {
          passageResult = await resolveAssessmentPassage({
            schoolId,
            contextType: 'map_practice',
            plan: plan._id,
            passageKey,
            title: String(carrier.passage_title || '').trim(),
            text: String(carrier.passage_text || '').trim(),
            source: String(carrier.passage_source || '').trim(),
            createdBy: userId
          });
          if (!passageText) passageText = normalizePassageText(passageResult.passage?.text || carrier.passage_text);
          if (!passageTitle) passageTitle = String(passageResult.passage?.title || carrier.passage_title || '').trim();
        } else {
          const stored = await findAssessmentPassage({ schoolId, contextType: 'map_practice', plan: plan._id, passageKey });
          passageResult = stored
            ? { passage: stored, conflict: null, error: null }
            : {
              passage: null,
              conflict: {
                passageKey,
                problem: `passage_id "${passageKey}" is used by this row, but no stored passage carries its text.`,
                fix: 'Give this row its passage_text, or import the row that holds the passage text first.'
              },
              error: null
            };
          if (stored) {
            passageText = normalizePassageText(stored.text);
            if (!passageTitle) passageTitle = String(stored.title || '').trim();
          }
        }
      }

      if (passageResult.conflict) {
        summary.errors += 1;
        summary.skipped += 1;
        if (mode === 'stop_on_error') {
          throw new Error(`${passageResult.conflict.problem} ${passageResult.conflict.fix}`);
        }
        continue;
      }

      const objectiveKey = ['ordering', 'fill_in_blank', 'numeric_response'].includes(validType.data)
        ? definition?.correctAnswer
        : String(values.correct_answer || '').trim();

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
        passageTitle,
        passageText,
        passage: passageResult.passage?._id || null,
        questionType: validType.data,
        stem: String(values.stem || '').trim(),
        options: [
          { key: 'A', text: String(values.option_a || '').trim() },
          { key: 'B', text: String(values.option_b || '').trim() },
          { key: 'C', text: String(values.option_c || '').trim() },
          { key: 'D', text: String(values.option_d || '').trim() }
        ].filter((option) => option.text),
        matchingPairs: matching.pairs,
        orderingItems: definition?.fields?.orderingItems || [],
        blanks: definition?.fields?.blanks || [],
        numericRule: definition?.fields?.numericRule || null,
        correctAnswer: objectiveKey,
        explanation: String(values.explanation || '').trim(),
        distractorNote: String(values.distractor_note || '').trim(),
        points: safeNumber(values.points, 1),
        order: safeNumber(values.order, 0),
        active: true,
        contentHash: `${skillCode}:${questionId}:${String(values.stem || '').trim()}`
      };

      await MapPracticeQuestion.findOneAndUpdate(
        { school: schoolId, plan: plan._id, questionId },
        { $set: questionPayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await MapPracticeSet.findByIdAndUpdate(setDoc._id, { $set: { questionCount: await MapPracticeQuestion.countDocuments({ school: schoolId, plan: plan._id, set: setDoc._id }) } });

      if (existingQuestion) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }
    }

    batchFiles.push({
      name: fileName,
      fileHash: file.fileHash || '',
      studentId: studentDoc.studentId,
      studentName: summary.studentName,
      studentMongoId: studentDoc._id,
      sourceStudentId: csvStudentId,
      planId: plan._id,
      firstSetId: summary.firstSetId,
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

  let batchRecord;
  try {
    batchRecord = await MapPracticeImportBatch.create({
      school: schoolId,
      importedBy: userId,
      commitToken: idempotencyKey,
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
  } catch (error) {
    if (error.code !== 11000 || !idempotencyKey) throw error;
    const duplicateQuery = MapPracticeImportBatch.findOne({ school: schoolId, commitToken: idempotencyKey });
    batchRecord = await duplicateQuery;
    if (!batchRecord) throw error;
    if (typeof batchRecord.lean === 'function') batchRecord = await batchRecord.lean();
    return { batch: batchRecord, summary: batchRecord.summary, newSkillsCreated: batchRecord.newSkillsCreated || [], replayed: true };
  }

  return { batch: batchRecord, summary: batchSummary, newSkillsCreated };
};
