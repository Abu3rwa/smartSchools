import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import { getTeacherClassIds } from '../helpers/teacherScoping.js';

const SPELLING_GRADES = new Set(['KG', 'G1', 'G2', 'G3', 'G4', 'G5']);

export const updateStudentSpellingPlacement = asyncHandler(async (req, res) => {
    const { grade } = req.body || {};
    if (!SPELLING_GRADES.has(grade)) {
        return res.status(400).json({
            success: false,
            message: 'Choose a valid spelling grade.'
        });
    }

    const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await Teacher.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
        const teacherClassIds = teacher ? await getTeacherClassIds(teacher._id) : [];
        const studentClassIds = [
            student.currentClass,
            ...(student.enrolledClasses || [])
        ].filter(Boolean).map(String);
        if (!teacherClassIds.some((classId) => studentClassIds.includes(String(classId)))) {
            return res.status(403).json({
                success: false,
                message: 'You can only update spelling placement for students in your classes.'
            });
        }
    }

    if (!student.spelling) student.spelling = {};
    if (!student.spelling.progressByGrade) student.spelling.progressByGrade = [];
    const progressByGrade = student.spelling.progressByGrade || [];
    const savedProgress = progressByGrade.find((entry) => entry.grade === grade);
    const isCurrentGrade = student.spelling.currentGrade === grade;
    const week = savedProgress?.week || (isCurrentGrade ? student.spelling.currentWeek : null) || 1;
    const lastWordIndex = savedProgress?.lastWordIndex
        ?? (isCurrentGrade ? student.spelling.lastWordIndex : null)
        ?? 0;
    if (!savedProgress) {
        student.spelling.progressByGrade.push({ grade, week, lastWordIndex });
    }
    student.spelling.currentGrade = grade;
    student.spelling.currentWeek = week;
    student.spelling.lastWordIndex = lastWordIndex;
    await student.save();

    return res.json({
        success: true,
        message: 'Student spelling placement updated.',
        data: { spelling: student.spelling }
    });
});
