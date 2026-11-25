import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import Teacher from '../models/Teacher.js';
import { getTeacherClassIds } from '../helpers/teacherScoping.js';
import {
    recalculateStudentProjection,
    studentNeedsProgressMigration
} from '../services/spellingProgressService.js';

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
    let savedProgress = progressByGrade.find((entry) => entry.grade === grade);
    if (!savedProgress) {
        savedProgress = { grade, week: 1, lastWordIndex: 0, placementStartWeek: 1 };
        student.spelling.progressByGrade.push(savedProgress);
    } else if (!savedProgress.placementStartWeek) {
        savedProgress.placementStartWeek = 1;
    }
    student.spelling.currentGrade = grade;
    student.spelling.currentWeek = savedProgress.week ?? null;
    student.spelling.lastWordIndex = savedProgress.lastWordIndex ?? 0;
    await student.save();

    // A student whose grade progress exists only as the legacy pointer keeps
    // that saved projection until the grade is migrated; recomputing from an
    // empty ledger would erase it.
    if (!(await studentNeedsProgressMigration({ schoolId: req.schoolId, grade, student }))) {
        const words = await SpellingWord.find({ school: req.schoolId, grade })
            .select('grade week order deletedAt')
            .sort({ week: 1, order: 1 })
            .lean();
        const projection = await recalculateStudentProjection({
            schoolId: req.schoolId,
            studentId: student._id,
            grade,
            words
        });
        if (projection) {
            savedProgress.week = projection.week;
            savedProgress.lastWordIndex = projection.lastWordIndex;
            student.spelling.currentWeek = projection.week;
            student.spelling.lastWordIndex = projection.lastWordIndex;
        }
    }

    return res.json({
        success: true,
        message: 'Student spelling placement updated.',
        data: { spelling: student.spelling }
    });
});
