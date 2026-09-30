import Student from '../models/Student.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';

export const ensureTeacherCanAccessStudent = async ({ req, studentId, studentModel = Student, teacherScope = { resolveTeacherProfile, getTeacherClassIds } } = {}) => {
  if (!studentId) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'teacher') return false;

  const teacher = await teacherScope.resolveTeacherProfile(req);
  if (!teacher) return false;

  const student = await studentModel.findOne({ _id: studentId, school: req.schoolId }).select('currentClass').lean();
  if (!student?.currentClass) return false;

  const classIds = await teacherScope.getTeacherClassIds(teacher._id);
  return classIds.some((classId) => String(classId) === String(student.currentClass));
};

export const ensureStudentOwnsPracticeData = async ({ req, studentId, studentModel = Student } = {}) => {
  if (!studentId) return false;
  const student = await studentModel.findOne({ _id: studentId, school: req.schoolId, user: req.user._id }).select('_id').lean();
  return Boolean(student);
};
