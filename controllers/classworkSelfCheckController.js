import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import ClassworkSelfCheck from '../models/ClassworkSelfCheck.js';
import ClassworkSelfCheckResponse from '../models/ClassworkSelfCheckResponse.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { isTeacherAuthorizedForClassSubject, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { pickSelectedRuleIds } from '../services/classworkSelfCheckScore.js';
import {
  buildCheckSummary,
  closeCheck,
  getCheckForDay,
  listClassStudents,
  listResponses,
  openOrReopenCheck,
  parseDay,
  publicCheck,
  snapshotRules,
  studentInClass,
  todayDayKey,
  toIsoDay
} from '../services/classworkSelfCheckService.js';

const isObjectId = (value) => mongoose.isValidObjectId(value);

/** The signed-in student, current academic year first, newest row as fallback. */
const studentForRequest = async (req) => {
  const academicYear = resolveAcademicYearForRequest(req);
  const fields = '_id user currentClass enrolledClasses academicYear firstName lastName';
  const student = await Student.findOne({ school: req.schoolId, user: req.user._id, academicYear })
    .select(fields)
    .lean();
  if (student) return student;
  return Student.findOne({ school: req.schoolId, user: req.user._id })
    .select(fields)
    .sort({ createdAt: -1 })
    .lean();
};

const canOperateClassSubject = async (req, classId, subjectId) => {
  if (req.user.role !== 'teacher') return true;
  const teacher = await resolveTeacherProfile(req);
  if (!teacher) return false;
  return isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
};

const readMaxMarks = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 10;
  return Math.min(1000, Math.max(0, number));
};

/* ------------------------------------------------------------------ */
/* Teacher / admin                                                     */
/* ------------------------------------------------------------------ */

export const setCheck = asyncHandler(async (req, res) => {
  const { classId, subjectId, date, open, maxMarks } = req.body || {};
  const day = parseDay(date);
  if (!isObjectId(classId) || !isObjectId(subjectId) || !day) {
    return res.status(400).json({ success: false, message: 'Choose a class, a subject and a date first.' });
  }
  if (typeof open !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Say whether the self-check should be open.' });
  }
  if (!await canOperateClassSubject(req, classId, subjectId)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized for this subject in this class'
    });
  }

  if (!open) {
    const closed = await closeCheck({ schoolId: req.schoolId, classId, subjectId, date: day });
    return res.json({ success: true, data: { check: publicCheck(closed) } });
  }

  const check = await openOrReopenCheck({
    schoolId: req.schoolId,
    teacherUserId: req.user._id,
    academicYear: resolveAcademicYearForRequest(req),
    classId,
    subjectId,
    date: day,
    maxMarks: readMaxMarks(maxMarks),
    rules: snapshotRules(req.user.uiPreferences?.classworkBehaviorRules)
  });

  return res.json({ success: true, data: { check: publicCheck(check) } });
});

export const getCurrentCheck = asyncHandler(async (req, res) => {
  const { classId, subjectId, date } = req.query;
  const day = parseDay(date);
  if (!isObjectId(classId) || !isObjectId(subjectId) || !day) {
    return res.status(400).json({ success: false, message: 'Choose a class, a subject and a date first.' });
  }
  if (!await canOperateClassSubject(req, classId, subjectId)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized for this subject in this class'
    });
  }

  const check = await getCheckForDay({ schoolId: req.schoolId, classId, subjectId, date: day });
  if (!check) {
    return res.json({ success: true, data: { check: null, students: [] } });
  }

  const [students, responses] = await Promise.all([
    listClassStudents({ schoolId: req.schoolId, classId }),
    listResponses({ schoolId: req.schoolId, checkId: check._id })
  ]);

  return res.json({
    success: true,
    data: {
      check: publicCheck(check),
      students: buildCheckSummary({ check, students, responses })
    }
  });
});

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

export const myChecks = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  if (!student) {
    return res.status(404).json({ success: false, message: 'This sign-in has no student record.' });
  }

  const classIds = [student.currentClass, ...(student.enrolledClasses || [])]
    .filter(Boolean)
    .map((entry) => entry?._id || entry);
  if (!classIds.length) {
    return res.json({ success: true, data: { checks: [] } });
  }

  const today = await todayDayKey(req.schoolId);
  const checks = await ClassworkSelfCheck.find({
    school: req.schoolId,
    status: 'open',
    date: today,
    class: { $in: classIds }
  })
    .populate('subject', 'name nameAr')
    .select('subject date rules maxMarks')
    .lean();

  if (!checks.length) {
    return res.json({ success: true, data: { checks: [] } });
  }

  const responses = await ClassworkSelfCheckResponse.find({
    school: req.schoolId,
    student: student._id,
    check: { $in: checks.map((check) => check._id) }
  })
    .select('check selectedRuleIds')
    .lean();
  const responseByCheck = new Map(
    responses.map((response) => [String(response.check?._id || response.check), response])
  );

  return res.json({
    success: true,
    data: {
      checks: checks.map((check) => {
        const response = responseByCheck.get(String(check._id));
        const subject = check.subject && typeof check.subject === 'object' ? check.subject : null;
        return {
          id: String(check._id),
          subject: {
            id: String(subject?._id || check.subject || ''),
            name: subject?.name || '',
            nameAr: subject?.nameAr || ''
          },
          date: toIsoDay(check.date),
          rules: publicCheck(check).rules,
          selectedRuleIds: response?.selectedRuleIds || [],
          submitted: Boolean(response)
        };
      })
    }
  });
});

export const saveMyResponse = asyncHandler(async (req, res) => {
  const checkId = String(req.params.id || '');
  if (!isObjectId(checkId)) {
    return res.status(404).json({ success: false, message: 'This classwork check is not available.' });
  }

  const check = await ClassworkSelfCheck.findOne({ _id: checkId, school: req.schoolId });
  if (!check) {
    return res.status(404).json({ success: false, message: 'This classwork check is not available.' });
  }
  if (check.status !== 'open') {
    return res.status(409).json({
      success: false,
      message: 'This check is closed now. Your teacher will review your work.'
    });
  }

  const student = await studentForRequest(req);
  if (!student || !studentInClass(student, check.class)) {
    return res.status(403).json({ success: false, message: 'This check is not for your class.' });
  }

  const selectedRuleIds = pickSelectedRuleIds(req.body?.selectedRuleIds, check.rules);
  const submittedAt = new Date();
  const filter = { school: req.schoolId, check: check._id, student: student._id };
  const update = {
    $set: { selectedRuleIds, submittedAt },
    $setOnInsert: { school: req.schoolId, check: check._id, student: student._id }
  };

  let response;
  try {
    response = await ClassworkSelfCheckResponse.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }).lean();
  } catch (error) {
    // Two taps at once can race on the unique (check, student) index.
    if (error?.code !== 11000) throw error;
    response = await ClassworkSelfCheckResponse.findOneAndUpdate(filter, update, { new: true }).lean();
  }

  return res.json({
    success: true,
    data: { submitted: true, submittedAt: response?.submittedAt || submittedAt }
  });
});
