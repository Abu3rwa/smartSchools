import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadMapPracticeCsv } from '../middleware/uploadMapPracticeCsv.js';
import { ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import Student from '../models/Student.js';
import { parseMapPracticeCsv, extractMapPracticeStudentIdFromFilename } from '../services/mapPracticeCsvService.js';

export const previewMapPracticeFiles = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  if (!req.files || !req.files.length) {
    return res.status(400).json({ success: false, message: 'At least one CSV file is required.' });
  }

  const previews = await Promise.all(req.files.map(async (file) => {
    const candidateText = file.buffer.toString('utf8');
    const parsed = parseMapPracticeCsv(candidateText, file.originalname);
    const studentIdFromFile = parsed.fileStudentId || extractMapPracticeStudentIdFromFilename(file.originalname);

    let matchedStudent = null;
    if (studentIdFromFile) {
      matchedStudent = await Student.findOne({ school: req.schoolId, studentId: studentIdFromFile.trim(), status: 'active' }).lean();
    }

    return {
      fileName: file.originalname,
      rows: parsed.rows,
      studentId: studentIdFromFile,
      matchedStudent: matchedStudent ? {
        _id: matchedStudent._id,
        firstName: matchedStudent.firstName,
        lastName: matchedStudent.lastName,
        studentId: matchedStudent.studentId
      } : null,
      warnings: parsed.warnings,
      validation: parsed.validation,
      decisions: {
        action: matchedStudent ? 'create' : 'skip',
        matchedStudentId: matchedStudent ? matchedStudent.studentId : null,
        warnings: [],
        errors: matchedStudent ? [] : ['Student could not be matched automatically. Choose a student in the UI.']
      }
    };
  }));

  res.json({ success: true, data: { previews } });
});

export const importMapPracticeFiles = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const { files = [], mode = 'stop_on_error', assignFirstSet = false, dueDate = null } = req.body || {};
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, message: 'No import files were supplied.' });
  }

  const prepared = [];
  for (const file of files) {
    if (!file?.fileName) continue;
    const studentId = String(file.decisions?.matchedStudentId || file.studentId || '').trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: `A student match is required for ${file.fileName}.` });
    }

    const student = await Student.findOne({ school: req.schoolId, studentId, status: 'active' }).select('_id studentId firstName lastName currentClass').lean();
    if (!student) {
      return res.status(400).json({ success: false, message: `Student ${studentId} was not found for ${file.fileName}.` });
    }

    const teacherAccess = await ensureTeacherCanAccessStudent({ req, studentId: student._id });
    if (!teacherAccess) {
      return res.status(403).json({ success: false, message: 'You are not authorized to import practice for this student.' });
    }

    prepared.push({ fileName: file.fileName, studentId: student.studentId, student: student._id, rows: file.rows || [], mode, assignFirstSet, dueDate });
  }

  res.json({ success: true, data: { imported: prepared, mode, assignFirstSet, dueDate } });
});

export { uploadMapPracticeCsv };
