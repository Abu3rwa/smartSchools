import ClassworkSelfCheck from '../models/ClassworkSelfCheck.js';
import ClassworkSelfCheckResponse from '../models/ClassworkSelfCheckResponse.js';
import Student from '../models/Student.js';
import { getSchoolTimeZone } from '../helpers/attendanceEligibility.js';
import { getDatePartsInTimeZone } from '../utils/schoolTimezone.js';
import {
  DEFAULT_CLASSWORK_RULES,
  buildClassworkRemark,
  computeClassworkScore,
  normalizeClassworkRules
} from './classworkSelfCheckScore.js';

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar day from the teacher's date picker, stored at UTC midnight. */
export const parseDay = (value) => {
  const raw = String(value || '').slice(0, 10);
  if (!DAY_PATTERN.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toIsoDay(date) !== raw) return null;
  return date;
};

export const toIsoDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const todayDayKey = async (schoolId) => {
  const timeZone = await getSchoolTimeZone(schoolId);
  const parts = getDatePartsInTimeZone(new Date(), timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
};

export const snapshotRules = (rawRules) => normalizeClassworkRules(
  Array.isArray(rawRules) && rawRules.length ? rawRules : DEFAULT_CLASSWORK_RULES
);

export const openOrReopenCheck = async ({
  schoolId,
  teacherUserId,
  academicYear,
  classId,
  subjectId,
  date,
  maxMarks,
  rules
}) => {
  const fields = {
    teacher: teacherUserId,
    academicYear: academicYear || '',
    maxMarks,
    rules,
    status: 'open',
    openedAt: new Date(),
    closedAt: null
  };
  const existing = await ClassworkSelfCheck.findOne({
    school: schoolId,
    class: classId,
    subject: subjectId,
    date
  });
  if (existing) {
    return ClassworkSelfCheck.findByIdAndUpdate(existing._id, { $set: fields }, { new: true });
  }
  return ClassworkSelfCheck.create({
    school: schoolId,
    class: classId,
    subject: subjectId,
    date,
    ...fields
  });
};

export const closeCheck = async ({ schoolId, classId, subjectId, date }) => ClassworkSelfCheck
  .findOneAndUpdate(
    { school: schoolId, class: classId, subject: subjectId, date },
    { $set: { status: 'closed', closedAt: new Date() } },
    { new: true }
  );

export const getCheckForDay = async ({ schoolId, classId, subjectId, date }) => ClassworkSelfCheck
  .findOne({ school: schoolId, class: classId, subject: subjectId, date });

export const listClassStudents = async ({ schoolId, classId }) => Student.find({
  school: schoolId,
  status: 'active',
  $or: [{ currentClass: classId }, { enrolledClasses: classId }]
})
  .select('_id firstName lastName')
  .sort({ firstName: 1, lastName: 1 })
  .lean();

export const listResponses = async ({ schoolId, checkId }) => ClassworkSelfCheckResponse
  .find({ school: schoolId, check: checkId })
  .select('student selectedRuleIds submittedAt')
  .lean();

export const studentInClass = (student, classId) => {
  const target = String(classId?._id || classId || '');
  if (!target) return false;
  const current = student?.currentClass;
  if (current && String(current._id || current) === target) return true;
  return (student?.enrolledClasses || []).some((entry) => String(entry?._id || entry) === target);
};

/** Every student of the class, with the mark recomputed from the snapshot. */
export const buildCheckSummary = ({ check, students = [], responses = [] }) => {
  const responsesByStudent = new Map(
    responses.map((response) => [String(response.student?._id || response.student), response])
  );

  return students.map((student) => {
    const response = responsesByStudent.get(String(student._id));
    const selectedRuleIds = response?.selectedRuleIds || [];
    const { score, selectedRules } = computeClassworkScore({
      maxMarks: check.maxMarks,
      selectedRuleIds,
      rules: check.rules
    });
    return {
      student: {
        id: String(student._id),
        name: [student.firstName, student.lastName].filter(Boolean).join(' ')
      },
      submitted: Boolean(response),
      submittedAt: response?.submittedAt || null,
      selectedRules: selectedRules.map((rule) => ({ id: rule.id, label: rule.label, value: rule.value })),
      score,
      remark: response ? buildClassworkRemark(selectedRules) : ''
    };
  });
};

export const publicCheck = (check) => {
  if (!check) return null;
  return {
    id: String(check._id),
    classId: String(check.class?._id || check.class || ''),
    subjectId: String(check.subject?._id || check.subject || ''),
    date: toIsoDay(check.date),
    maxMarks: Number(check.maxMarks ?? 10),
    status: check.status,
    openedAt: check.openedAt || null,
    closedAt: check.closedAt || null,
    rules: normalizeClassworkRules(check.rules).map((rule) => ({
      id: rule.id,
      label: rule.label,
      labelAr: rule.labelAr,
      value: rule.value,
      direction: rule.direction
    }))
  };
};
