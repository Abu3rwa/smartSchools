import { asyncHandler } from '../middleware/errorHandler.js';
import Class from '../models/Class.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import Student from '../models/Student.js';
import { ensureTeacherCanAccessClass, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { generateMapPracticeReportPdf } from '../services/mapPracticeReportPdfService.js';
import {
  buildMapPracticeClassReport,
  buildMapPracticeStudentReport,
  resolveMapPracticeReportPeriod
} from '../services/mapPracticeReportService.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';

const getReportContext = (req) => {
  const academicYear = resolveSchoolAcademicYear(req.school || { settings: { currentAcademicYear: req.academicYear } });
  const period = resolveMapPracticeReportPeriod({ query: req.query, academicYear, school: req.school });
  return { academicYear, period };
};

const loadReportData = async ({ schoolId, studentIds, academicYear, period }) => {
  const [plans, sets, assignments, attempts] = await Promise.all([
    MapPracticePlan.find({ school: schoolId, student: { $in: studentIds }, academicYear }).lean(),
    MapPracticeSet.find({ school: schoolId, student: { $in: studentIds } }).select('_id student title plan').lean(),
    MapPracticeAssignment.find({
      school: schoolId,
      student: { $in: studentIds },
      status: { $in: ['assigned', 'active'] }
    }).select('student plan set status').lean(),
    MapPracticeAttempt.find({
      school: schoolId,
      student: { $in: studentIds },
      status: { $in: ['submitted', 'reviewed'] },
      submittedAt: { $gte: period.startDate, $lte: period.endDate }
    })
      .select('student plan set status submittedAt reviewStatus answers')
      .sort({ submittedAt: 1 })
      .lean()
  ]);
  const activePlanIds = new Set(plans.map((plan) => String(plan._id)));
  const reportSets = sets.filter((set) => activePlanIds.has(String(set.plan)));
  const activeSetIds = new Set(reportSets.map((set) => String(set._id)));
  const reportAssignments = assignments.filter((assignment) => activePlanIds.has(String(assignment.plan)) && activeSetIds.has(String(assignment.set)));
  const filteredAttempts = attempts.filter((attempt) => activePlanIds.has(String(attempt.plan)));
  const questionIds = [...new Set(filteredAttempts.flatMap((attempt) => (attempt.answers || [])
    .map((answer) => String(answer.question)).filter(Boolean)))];
  const questions = questionIds.length
    ? await MapPracticeQuestion.find({ school: schoolId, _id: { $in: questionIds } }).select('_id skill strand').lean()
    : [];
  const skillIds = [...new Set(questions.map((question) => String(question.skill)).filter(Boolean))];
  const skills = skillIds.length
    ? await MapPracticeSkill.find({ school: schoolId, _id: { $in: skillIds } }).select('_id code name strand').lean()
    : [];
  const skillById = new Map(skills.map((skill) => [String(skill._id), skill]));
  const questionById = new Map(questions.map((question) => [
    String(question._id),
    { skill: skillById.get(String(question.skill)) || null, strand: question.strand }
  ]));
  const setById = new Map(reportSets.map((set) => [String(set._id), set]));
  const reportAttempts = filteredAttempts.map((attempt) => ({
    ...attempt,
    set: setById.get(String(attempt.set)) || null,
    answers: (attempt.answers || []).map((answer) => ({
      ...answer,
      question: questionById.get(String(answer.question)) || null
    }))
  }));
  return { sets: reportSets, assignments: reportAssignments, attempts: reportAttempts };
};

const sendReport = async (res, report, filename) => {
  const pdf = await generateMapPracticeReportPdf(report);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store, max-age=0'
  });
  return res.send(pdf);
};

export const exportMapPracticeStudentReport = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const { academicYear, period } = getReportContext(req);
  const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId })
    .select('_id firstName lastName studentId currentGrade currentClass enrolledClasses')
    .populate({ path: 'currentClass', select: 'name grade academicYear', match: { school: req.schoolId } })
    .lean();
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  if (!(await ensureTeacherCanAccessStudent({ req, studentId: student._id }))) {
    return res.status(403).json({ success: false, message: 'Not authorized for this student.' });
  }

  const data = await loadReportData({ schoolId: req.schoolId, studentIds: [student._id], academicYear, period });
  const report = buildMapPracticeStudentReport({ student, academicYear, period, ...data });
  const filename = `map-practice-student-${String(student.studentId || student._id).replace(/[^a-zA-Z0-9_-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return sendReport(res, report, filename);
});

export const exportMapPracticeClassReport = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const { academicYear, period } = getReportContext(req);
  const classRecord = await Class.findOne({ _id: req.params.classId, school: req.schoolId, academicYear })
    .select('_id name grade section academicYear')
    .lean();
  if (!classRecord) return res.status(404).json({ success: false, message: 'Class not found for the current academic year.' });

  if (!(await ensureTeacherCanAccessClass({ req, classId: classRecord._id }))) {
    return res.status(403).json({ success: false, message: 'Not authorized for this class.' });
  }

  const students = await Student.find({
    school: req.schoolId,
    academicYear,
    status: 'active',
    $or: [{ currentClass: classRecord._id }, { enrolledClasses: classRecord._id }]
  }).select('_id firstName lastName studentId').sort({ firstName: 1, lastName: 1 }).lean();

  const data = await loadReportData({
    schoolId: req.schoolId,
    studentIds: students.map((student) => student._id),
    academicYear,
    period
  });
  const report = buildMapPracticeClassReport({ classRecord, students, academicYear, period, ...data });
  const filename = `map-practice-class-${String(classRecord.name || classRecord._id).replace(/[^a-zA-Z0-9_-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return sendReport(res, report, filename);
});
