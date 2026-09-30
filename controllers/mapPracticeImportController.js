import crypto from 'crypto';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadMapPracticeCsv } from '../middleware/uploadMapPracticeCsv.js';
import { ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import { buildMapPracticePreview, createMapPracticeImportToken, validateMapPracticeImportToken, resolveMapPracticeStudentMatch, importMapPracticeFiles as runImportMapPracticeFiles } from '../services/mapPracticeImportService.js';
import { parseMapPracticeCsv } from '../services/mapPracticeCsvService.js';

const previewCache = new Map();
const clearExpiredPreviews = () => {
  const now = Date.now();
  for (const [token, cached] of previewCache) {
    if (cached.expiresAt < now) previewCache.delete(token);
  }
};

const getAcademicYear = (req) => resolveSchoolAcademicYear(req.school || { settings: { currentAcademicYear: req.academicYear } });

export const buildMapPracticeOverviewSummary = ({ students = [], plans = [], pendingReviewItems = 0, assignments = 0 }) => ({
  students: students.length,
  withPlan: new Set(plans.map((plan) => String(plan.student))).size,
  waitingForReview: pendingReviewItems,
  reviewQueue: pendingReviewItems,
  assigned: assignments
});

export const getMapPracticeImportStudents = asyncHandler(async (req, res) => {
  const academicYear = getAcademicYear(req);
  const query = { school: req.schoolId, academicYear, status: 'active' };
  if (req.user.role === 'teacher') {
    const teacher = await resolveTeacherProfile(req);
    const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
    query.$or = [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }];
  }

  const students = await Student.find(query)
    .select('_id firstName lastName studentId email currentClass enrolledClasses')
    .populate('currentClass', 'name')
    .sort({ firstName: 1, lastName: 1 })
    .lean();
  res.json({ success: true, data: { academicYear, students } });
});

export const getMapPracticeOverview = asyncHandler(async (req, res) => {
  const academicYear = getAcademicYear(req);
  const studentQuery = { school: req.schoolId, academicYear, status: 'active' };
  if (req.user.role === 'teacher') {
    const teacher = await resolveTeacherProfile(req);
    const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
    studentQuery.$or = [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }];
  }

  const [students, plans, classes] = await Promise.all([
    Student.find(studentQuery).select('_id firstName lastName studentId currentClass enrolledClasses').populate('currentClass', 'name').sort({ firstName: 1, lastName: 1 }).lean(),
    MapPracticePlan.find({ school: req.schoolId, academicYear, status: 'active' }).select('_id student title updatedAt').lean(),
    (async () => {
      const classQuery = { school: req.schoolId, academicYear, isActive: true };
      if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        classQuery._id = { $in: teacher ? await getTeacherClassIds(teacher._id) : [] };
      }
      return Class.find(classQuery).select('name grade section academicYear').sort({ grade: 1, section: 1 }).lean();
    })()
  ]);

  const studentIds = students.map((student) => student._id);
  const scopedPlans = plans.filter((plan) => studentIds.some((studentId) => String(studentId) === String(plan.student)));
  const plannedStudentIds = new Set(scopedPlans.map((plan) => String(plan.student)));
  const planIds = scopedPlans.map((plan) => plan._id);
  const [attempts, assignments] = await Promise.all([
    MapPracticeAttempt.find({ school: req.schoolId, student: { $in: studentIds }, plan: { $in: planIds } }).select('student plan submittedAt status reviewStatus score maxScore answers').sort({ submittedAt: -1 }).lean(),
    MapPracticeAssignment.find({ school: req.schoolId, student: { $in: studentIds }, plan: { $in: planIds }, status: { $in: ['assigned', 'active'] } }).select('student plan status dueDate set createdAt').lean()
  ]);

  const questionIds = [...new Set(attempts.flatMap((attempt) => attempt.answers.map((answer) => String(answer.question))).filter(Boolean))];
  const attemptQuestions = questionIds.length
    ? await MapPracticeQuestion.find({ school: req.schoolId, _id: { $in: questionIds } }).select('_id questionType skill').populate('skill', 'code name').lean()
    : [];
  const questionById = new Map(attemptQuestions.map((question) => [String(question._id), question]));
  const plansByStudent = new Map();
  scopedPlans.forEach((plan) => plansByStudent.set(String(plan.student), plan));
  const assignmentsByStudent = new Map();
  assignments.forEach((assignment) => assignmentsByStudent.set(String(assignment.student), (assignmentsByStudent.get(String(assignment.student)) || 0) + 1));
  const weekAgo = Date.now() - 7 * 86400000;
  const studentsWithMetrics = students.map((student) => {
    const studentAttempts = attempts.filter((attempt) => String(attempt.student) === String(student._id));
    const studentAnswers = studentAttempts.flatMap((attempt) => attempt.answers.map((answer) => ({ ...answer, questionData: questionById.get(String(answer.question)), submittedAt: attempt.submittedAt })))
      .sort((first, second) => new Date(second.submittedAt || 0) - new Date(first.submittedAt || 0));
    const scoredAnswers = studentAnswers.filter((answer) => answer.isCorrect !== null).slice(0, 20);
    const skillStats = new Map();
    studentAnswers.filter((answer) => answer.isCorrect !== null && answer.questionData?.skill).forEach((answer) => {
      const skill = answer.questionData.skill;
      const key = String(skill._id);
      const stat = skillStats.get(key) || { code: skill.code, name: skill.name, correct: 0, total: 0 };
      stat.total += 1;
      if (answer.isCorrect) stat.correct += 1;
      skillStats.set(key, stat);
    });
    const lastPractice = studentAttempts.find((attempt) => attempt.submittedAt)?.submittedAt || null;
    const accuracy = scoredAnswers.length ? Math.round(scoredAnswers.filter((answer) => answer.isCorrect).length / scoredAnswers.length * 100) : null;
    const hasPlan = plansByStudent.has(String(student._id));
    const status = !hasPlan ? 'noPracticeFile' : !lastPractice ? 'notStarted' : Date.now() - new Date(lastPractice).getTime() > 7 * 86400000 ? 'noActivity' : accuracy !== null && accuracy < 60 ? 'needsFollowUp' : 'onTrack';
    return {
      ...student,
      practiceMetrics: {
        accuracy,
        lastPractice,
        finishedThisWeek: studentAttempts.filter((attempt) => attempt.submittedAt && new Date(attempt.submittedAt).getTime() >= weekAgo).length,
        assigned: assignmentsByStudent.get(String(student._id)) || 0,
        status,
        focusSkills: [...skillStats.values()].map((skill) => ({ ...skill, accuracy: Math.round(skill.correct / skill.total * 100) })).sort((first, second) => first.accuracy - second.accuracy)
      }
    };
  });

  const classSummaries = classes.map((classItem) => {
    const classStudents = students.filter((student) => String(student.currentClass?._id || student.currentClass) === String(classItem._id) || (student.enrolledClasses || []).some((id) => String(id?._id || id) === String(classItem._id)));
    const classStudentIds = new Set(classStudents.map((student) => String(student._id)));
    const withPlan = classStudents.filter((student) => plannedStudentIds.has(String(student._id))).length;
    const noRecentPractice = classStudents.filter((student) => !attempts.some((attempt) => String(attempt.student) === String(student._id) && attempt.submittedAt && Date.now() - new Date(attempt.submittedAt).getTime() <= 7 * 86400000)).length;
    return { ...classItem, studentCount: classStudents.length, withPlanCount: withPlan, needsFollowUpCount: noRecentPractice, studentIds: [...classStudentIds] };
  });
  const pendingAttempts = attempts.filter((attempt) => attempt.status === 'submitted' && attempt.reviewStatus === 'pending');
  const shortTextQuestionIds = new Set(attemptQuestions.filter((question) => question.questionType === 'short_text').map((question) => String(question._id)));
  const pendingReviewItems = pendingAttempts.reduce((count, attempt) => count + attempt.answers.filter((answer) => answer.isCorrect === null && shortTextQuestionIds.has(String(answer.question))).length, 0);

  res.json({
    success: true,
    data: {
      academicYear,
      students: studentsWithMetrics,
      classes: classSummaries,
      plans: scopedPlans,
      summary: {
        ...buildMapPracticeOverviewSummary({ students, plans: scopedPlans, pendingReviewItems, assignments: assignments.length }),
      }
    }
  });
});

export const previewMapPracticeFiles = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  if (!req.files || !req.files.length) {
    return res.status(400).json({ success: false, message: 'At least one CSV file is required.' });
  }

  let overrideMap = {};
  try {
    const rawOverrides = req.body?.overrides;
    if (rawOverrides) {
      overrideMap = typeof rawOverrides === 'string' ? JSON.parse(rawOverrides) : rawOverrides;
    }
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid override payload.' });
  }

  clearExpiredPreviews();
  const previewEntries = await Promise.all(req.files.map(async (file, index) => {
    const overrideStudentId = overrideMap[index] || overrideMap[file.originalname] || null;
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    let preview;
    let rows = [];
    try {
      const parsed = parseMapPracticeCsv(file.buffer.toString('utf8'), file.originalname);
      rows = parsed.rows;
      preview = await buildMapPracticePreview({
        schoolId: req.schoolId,
        fileName: file.originalname,
        fileBuffer: file.buffer,
        overrideStudentId,
        academicYear: getAcademicYear(req)
      });
    } catch (error) {
      preview = {
        fileName: file.originalname,
        fileHash,
        rows: 0,
        status: 'has_errors',
        csvStudentId: '',
        filenameStudentId: '',
        matchedBy: null,
        student: null,
        planTitle: file.originalname,
        sets: [],
        skills: [],
        questionTypes: { mcq: 0, multi_select: 0, short_text: 0 },
        passages: 0,
        willCreate: 0,
        willUpdate: 0,
        notInNewFile: 0,
        errors: [{ row: 0, column: 'file', problem: error.message, fix: 'Check the CSV headers and file contents, then preview again.' }],
        warnings: []
      };
    }
    if (req.user.role === 'teacher' && preview.student?.id && !(await ensureTeacherCanAccessStudent({ req, studentId: preview.student.id }))) {
      preview.status = 'has_errors';
      preview.errors.push({ row: 1, column: 'student_id', problem: 'This student is outside your assigned classes.', fix: 'Choose a student in one of your classes.' });
      preview.student = null;
      preview.matchedBy = null;
    }
    return { preview, file: { ...preview, rows, errors: preview.errors } };
  }));

  const uniqueEntries = [];
  const seenHashes = new Set();
  for (const entry of previewEntries) {
    if (seenHashes.has(entry.preview.fileHash)) continue;
    seenHashes.add(entry.preview.fileHash);
    uniqueEntries.push(entry);
  }
  const previews = uniqueEntries.map(({ preview }) => {
    const filePreview = { ...preview };
    delete filePreview.token;
    delete filePreview.tokenExpiresAt;
    delete filePreview.notInNewQuestionIds;
    return filePreview;
  });
  const tokenData = createMapPracticeImportToken({ schoolId: req.schoolId, fileHashes: previews.map((preview) => preview.fileHash) });
  previewCache.set(tokenData.token, { schoolId: String(req.schoolId), files: uniqueEntries.map(({ file }) => file), expiresAt: Date.parse(tokenData.tokenExpiresAt) });
  res.json({ success: true, data: { files: previews, token: tokenData.token, tokenExpiresAt: tokenData.tokenExpiresAt } });
});

export const importMapPracticeFiles = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const body = req.body || {};
  const files = Array.isArray(body.files) ? body.files : [];
  const token = body.token || body.previewToken || null;
  const fileHashes = files.map((file) => file.fileHash).filter(Boolean);

  const cachedPreview = previewCache.get(token);
  if (!token || !cachedPreview || cachedPreview.schoolId !== String(req.schoolId) || cachedPreview.expiresAt < Date.now() || !validateMapPracticeImportToken({ token, fileHashes, schoolId: req.schoolId })) {
    return res.status(400).json({ success: false, message: 'This preview token is invalid or expired.' });
  }

  const options = body.options || {};
  const overrides = options.overrides || body.overrides || {};
  const preparedFiles = files.map((file, index) => {
    const cachedFile = cachedPreview.files.find((item) => item.fileHash === file.fileHash);
    return {
      ...cachedFile,
      fileName: cachedFile?.fileName,
      overrideStudentId: overrides[index] || overrides[file.fileName || cachedFile?.fileName] || null,
      csvStudentId: cachedFile?.csvStudentId || '',
      rows: cachedFile?.rows || [],
      createNewSkills: options.createNewSkills || {},
      useExistingSkill: options.useExistingSkill || {},
      decisions: { errors: cachedFile?.errors || [] }
    };
  }).filter((file) => file.fileName);

  if (preparedFiles.length !== files.length || preparedFiles.some((file) => !file.rows.length)) {
    return res.status(400).json({ success: false, message: 'The preview files no longer match this token. Preview the files again.' });
  }
  if (preparedFiles.some((file) => file.decisions.errors.length && body.errorMode !== 'skip')) {
    return res.status(400).json({ success: false, message: 'Fix file errors or choose skip-errors mode.' });
  }

  for (const file of preparedFiles) {
    let resolution;
    try {
      resolution = await resolveMapPracticeStudentMatch({ schoolId: req.schoolId, csvStudentId: file.csvStudentId, filenameStudentId: file.filenameStudentId, selectedStudentId: file.overrideStudentId, academicYear: getAcademicYear(req) });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (resolution.status !== 'ready') {
      return res.status(400).json({ success: false, message: resolution.message || 'Choose a student for every file before importing.' });
    }
    if (resolution.student?.id && req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: resolution.student.id }))) {
      return res.status(403).json({ success: false, message: 'This student is outside your assigned classes.' });
    }
  }

  const mode = body.errorMode === 'skip' ? 'skip_errors' : 'stop_on_error';

  const result = await runImportMapPracticeFiles({
    schoolId: req.schoolId,
    userId: req.user._id,
    files: preparedFiles,
    mode,
    idempotencyKey: token,
    academicYear: getAcademicYear(req)
  });

  const assignmentOptions = options.assignFirstSet || {};
  if (assignmentOptions.enabled && !result.replayed) {
    for (const file of preparedFiles) {
      const importedFile = result.batch?.files?.find((item) => item.name === file.fileName);
      if (!importedFile?.studentMongoId || !importedFile.planId) continue;
      const set = await MapPracticeSet.findOne({ school: req.schoolId, plan: importedFile.planId }).sort({ order: 1 }).lean();
      if (!set) continue;
      await MapPracticeAssignment.findOneAndUpdate(
        { school: req.schoolId, student: importedFile.studentMongoId, set: set._id },
        { $set: { school: req.schoolId, student: importedFile.studentMongoId, plan: importedFile.planId, set: set._id, assignedBy: req.user._id, dueDate: assignmentOptions.dueDate ? new Date(assignmentOptions.dueDate) : null, status: 'assigned' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  const imported = (result.batch?.files || []).map((file) => ({
    ...file,
    errorsReportUrl: file.skipped > 0 ? `/api/map-test-prep/practice/import/errors/${encodeURIComponent(token)}/${encodeURIComponent(file.fileHash)}` : null
  }));
  res.json({ success: true, data: { imported, mode, summary: result.summary, token, replayed: Boolean(result.replayed), files: imported } });
});

export const downloadMapPracticeImportErrors = asyncHandler(async (req, res) => {
  const { token, fileHash } = req.params;
  const cached = previewCache.get(token);
  if (!cached || cached.schoolId !== String(req.schoolId) || cached.expiresAt < Date.now() || !validateMapPracticeImportToken({ token, fileHashes: cached.files.map((file) => file.fileHash), schoolId: req.schoolId })) {
    return res.status(404).json({ success: false, message: 'The error report is no longer available.' });
  }
  const batch = await MapPracticeImportBatch.findOne({ school: req.schoolId, commitToken: token }).select('_id').lean();
  if (!batch) return res.status(404).json({ success: false, message: 'The import batch was not found.' });
  const file = cached.files.find((item) => item.fileHash === fileHash);
  if (!file) return res.status(404).json({ success: false, message: 'The import file was not found.' });
  if (req.user.role === 'teacher' && file.student?.id && !(await ensureTeacherCanAccessStudent({ req, studentId: file.student.id }))) {
    return res.status(403).json({ success: false, message: 'This student is outside your assigned classes.' });
  }
  const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['row', 'column', 'problem', 'fix'], ...(file.errors || []).map((error) => [error.row, error.column, error.problem, error.fix])];
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  res.attachment(`${String(file.fileName || 'map-practice').replace(/[^A-Za-z0-9._-]/g, '_')}-errors.csv`).type('text/csv').send(csv);
});

export const archiveMapPracticeQuestionsNotInFile = asyncHandler(async (req, res) => {
  const { token, fileHash } = req.body || {};
  const cached = previewCache.get(token);
  if (!cached || cached.schoolId !== String(req.schoolId) || cached.expiresAt < Date.now() || !validateMapPracticeImportToken({ token, fileHashes: cached.files.map((file) => file.fileHash), schoolId: req.schoolId })) {
    return res.status(400).json({ success: false, message: 'This preview token is invalid or expired.' });
  }
  const batch = await MapPracticeImportBatch.findOne({ school: req.schoolId, commitToken: token }).select('_id').lean();
  if (!batch) return res.status(409).json({ success: false, message: 'Import this preview before archiving questions.' });
  const cachedFile = cached.files.find((file) => file.fileHash === fileHash);
  if (!cachedFile?.student?.id) return res.status(404).json({ success: false, message: 'No matched student was found for this file.' });
  if (req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: cachedFile.student.id }))) {
    return res.status(403).json({ success: false, message: 'This student is outside your assigned classes.' });
  }
  const questionIds = cachedFile.notInNewQuestionIds || [];
  if (!questionIds.length) return res.json({ success: true, data: { archived: 0 } });
  const plan = await MapPracticePlan.findOne({ school: req.schoolId, student: cachedFile.student.id, normalizedTitle: String(cachedFile.planTitle || '').toLowerCase(), academicYear: getAcademicYear(req) }).select('_id').lean();
  if (!plan) return res.status(404).json({ success: false, message: 'Practice plan not found.' });
  const result = await MapPracticeQuestion.updateMany({ school: req.schoolId, plan: plan._id, questionId: { $in: questionIds } }, { $set: { active: false } });
  res.json({ success: true, data: { archived: result.modifiedCount || 0 } });
});

export { uploadMapPracticeCsv };
